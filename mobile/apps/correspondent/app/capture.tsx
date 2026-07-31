import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import * as Battery from "expo-battery";
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from "react-native-vision-camera";
import { Square } from "lucide-react-native";
import {
  CaptureEngine,
  RUNG_LABEL_FR,
  statusLine,
  type EngineTick,
  type PowerState,
} from "@elongo/domain";
import { colour, dataSize, humanDuration, space, text, timecode, type LadderSample } from "@elongo/design";

import { SignalLadder } from "../src/components/SignalLadder";
import { StatusBanner } from "../src/components/StatusBanner";
import { SqliteSegmentStore } from "../src/capture/store";
import { MediaTransport } from "../src/capture/transport";
import { DEFAULT_CAPACITY_WH, LIVE_WINDOW_SEC, MEDIA_BASE_URL, SEGMENT_SEC } from "../src/lib/config";

/**
 * The capture screen.
 *
 * What the correspondent sees while filming, and the one screen where every
 * decision in `docs/06` becomes visible. Three rules govern it:
 *
 *   THE SCREEN MAY GO DARK; THE CAPTURE MAY NOT. When the power budget says the
 *   preview cannot be afforded, the preview goes — not the recording. The
 *   correspondent is watching the wedding, not the handset.
 *
 *   NEVER A BARE SPINNER. Every state has words, in French, including the ones
 *   that are bad news. The family's anxiety is uncertainty, not low quality.
 *
 *   STOPPING IS NOT FINISHING. The recorders stop, then the event is closed on
 *   the server, and only then does the queue drain. The web client shipped with
 *   the close call accidentally removed and left every event marked live
 *   forever.
 *
 * VisionCamera's chunked recording is the piece this depends on and the piece
 * that must be validated on real hardware before anything else is built —
 * see Phase A in docs/12.
 */

export default function CaptureScreen() {
  useKeepAwake();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { presenceId, key } = useLocalSearchParams<{ presenceId: string; key: string }>();

  const device = useCameraDevice("back");
  const { hasPermission: camOk, requestPermission: askCam } = useCameraPermission();
  const { hasPermission: micOk, requestPermission: askMic } = useMicrophonePermission();

  const cameraRef = useRef<Camera>(null);
  const engineRef = useRef<CaptureEngine | null>(null);
  const storeRef = useRef<SqliteSegmentStore | null>(null);
  const transportRef = useRef<MediaTransport | null>(null);
  const startedAt = useRef<number>(Date.now());

  const [tick, setTick] = useState<EngineTick | null>(null);
  const [samples, setSamples] = useState<LadderSample[]>([]);
  const [battery, setBattery] = useState<number>(1);
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!camOk) void askCam();
    if (!micOk) void askMic();
  }, [camOk, micOk, askCam, askMic]);

  useEffect(() => {
    void Battery.getBatteryLevelAsync().then(setBattery).catch(() => {});
    const sub = Battery.addBatteryLevelListener(({ batteryLevel }) => setBattery(batteryLevel));
    return () => sub.remove();
  }, []);

  // --- the engine ---------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      const store = await SqliteSegmentStore.open(presenceId);
      if (cancelled) return;
      const transport = new MediaTransport({ baseUrl: MEDIA_BASE_URL, presenceId, key, store });
      const engine = new CaptureEngine({
        store,
        transport,
        clock: () => (Date.now() - startedAt.current) / 1000,
        options: { liveWindowSec: LIVE_WINDOW_SEC },
      });
      storeRef.current = store;
      transportRef.current = transport;
      engineRef.current = engine;

      // A failed open is not fatal: the segments are already going to disk, and
      // ingest is idempotent, so the event repairs itself once the link returns.
      await transport.open({ v: "video/mp4", a: "audio/mp4" }).catch(() => {});

      timer = setInterval(() => {
        void runTick();
      }, 1000);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceId, key]);

  async function runTick() {
    const engine = engineRef.current;
    if (!engine) return;
    const seconds = (Date.now() - startedAt.current) / 1000;

    const power: PowerState = {
      batteryLevel: battery,
      capacityWh: DEFAULT_CAPACITY_WH,
      // Until a booked end time is wired through from the mission, assume the
      // longest tier. Assuming *short* would be the dangerous default: it lets
      // the app spend battery it does not have.
      secondsRemaining: Math.max(60, 4 * 3600 - seconds),
      signal: 0.6,
    };

    const result = await engine.tick(power);
    setTick(result);
    setElapsed(seconds);
    setSamples((prev) => [...prev, { atSec: seconds, coversSec: 1, rung: result.rung.index }]);
  }

  // --- stopping -----------------------------------------------------------

  async function stop() {
    setStopping(true);
    try {
      // Order matters. Stop recording first so nothing new is captured, then
      // tell the server the event is over. The queue keeps draining after both.
      await cameraRef.current?.stopRecording().catch(() => {});
      await transportRef.current?.close();
      router.replace("/");
    } catch {
      Alert.alert(
        "Fin non confirmée",
        "L'enregistrement est arrêté et rien n'est perdu, mais le serveur n'a pas encore reçu la fin. Gardez l'application ouverte quelques minutes.",
      );
      setStopping(false);
    }
  }

  // --- render -------------------------------------------------------------

  if (!device || !camOk || !micOk) {
    return (
      <View style={{ flex: 1, backgroundColor: colour.ink950, padding: space.xl, justifyContent: "center" }}>
        <Text style={[text.title, { color: colour.ink50 }]}>Autorisations nécessaires</Text>
        <Text style={[text.body, { color: colour.ink300, marginTop: space.sm }]}>
          Elongo a besoin de la caméra et du micro pour filmer la cérémonie. Aucune image ne quitte
          le téléphone sans le lien privé de la famille.
        </Text>
      </View>
    );
  }

  const status = tick?.status ?? statusLine(null, "idle");
  const showPreview = tick?.screenOn ?? true;

  return (
    <View style={{ flex: 1, backgroundColor: colour.ink950 }}>
      <View style={{ flex: 1 }}>
        {showPreview ? (
          <Camera
            ref={cameraRef}
            device={device}
            isActive
            video
            audio
            style={{ flex: 1 }}
          />
        ) : (
          // The power budget has taken the preview. Say so — a black screen
          // with no explanation is how a correspondent decides the app crashed
          // and restarts it mid-ceremony.
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
            <Text style={[text.title, { color: colour.ink50, textAlign: "center" }]}>
              Écran éteint pour économiser la batterie
            </Text>
            <Text style={[text.body, { color: colour.ink300, textAlign: "center", marginTop: space.md }]}>
              L'enregistrement continue. Touchez pour rallumer un instant.
            </Text>
          </View>
        )}
      </View>

      <View style={{ padding: space.lg, gap: space.md }}>
        <StatusBanner status={status} batteryPct={battery * 100} />

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[text.dataLarge, { color: colour.ink50 }]}>{timecode(elapsed)}</Text>
          <Text style={[text.data, { color: colour.ink300 }]}>
            {RUNG_LABEL_FR[tick?.rung.index ?? 1]} · {dataSize(tick?.pendingBytes ?? 0)} en attente
          </Text>
        </View>

        <SignalLadder samples={samples} width={width - space.lg * 2} height={40} durationSec={Math.max(60, elapsed)} />

        <Text style={[text.small, { color: colour.ink500 }]}>
          Segments de {humanDuration(SEGMENT_SEC)} · tout est gardé sur le téléphone jusqu'à réception
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={stop}
          disabled={stopping}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: space.sm,
            minHeight: 56,
            borderRadius: 8,
            backgroundColor: stopping ? colour.ink800 : colour.brick,
          }}
        >
          <Square size={18} strokeWidth={2.5} color={colour.ink50} fill={colour.ink50} />
          <Text style={[text.bodyStrong, { color: colour.ink50 }]}>
            {stopping ? "Fin en cours…" : "Terminer"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
