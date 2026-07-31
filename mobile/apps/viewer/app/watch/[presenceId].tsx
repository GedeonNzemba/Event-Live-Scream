import { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Share2 } from "lucide-react-native";
import { MediaClient, type Manifest } from "@elongo/api";
import { colour, iconSize, percent, space, stroke, text, timecode, tone as toneColour, type LadderSample } from "@elongo/design";

import { SignalLadder } from "../../src/components/SignalLadder";
import { MANIFEST_POLL_MS, MEDIA_BASE_URL } from "../../src/lib/config";

/**
 * The watch screen.
 *
 * Two things here are the product rather than the plumbing.
 *
 * FIRST, THE STATUS FOLLOWS THE PLAYHEAD. Scrub to 14:32 and the status line
 * describes 14:32 — not what is happening in Brazzaville right now. The web
 * player shipped painting the current status across the whole recording, and
 * the verdict on it was blunt: "a high graded system can not work like this. It
 * must report the issue exactly at the very moment it occurred." Per-segment
 * rungs in the manifest are what make this possible.
 *
 * SECOND, COMPLETENESS IS STATED, NOT IMPLIED. A recording that is 96% arrived
 * says so, because the alternative — looking complete and having a hole — is
 * the worst outcome the archive guarantee can produce.
 *
 * The player itself is `expo-video` over HLS, which is what fMP4 segments from
 * VisionCamera unlock (docs/12). Until the native capture path lands, the
 * server only produces the JSON manifest the browser player uses, so this
 * screen renders the timeline and the status and leaves the video surface for
 * that milestone. It is listed as an open item in mobile/README.md.
 */

export default function WatchScreen() {
  const { presenceId, t } = useLocalSearchParams<{ presenceId: string; t: string }>();
  const { width } = useWindowDimensions();
  const [playheadSec, setPlayheadSec] = useState<number | null>(null);

  const client = useMemo(() => new MediaClient({ baseUrl: MEDIA_BASE_URL }), []);

  const { data: manifest, error } = useQuery<Manifest>({
    queryKey: ["manifest", presenceId, t],
    queryFn: () => client.manifest(presenceId, t),
    refetchInterval: (query) => (query.state.data?.live ? MANIFEST_POLL_MS : false),
  });

  const samples: LadderSample[] = useMemo(() => {
    if (!manifest) return [];
    // Audio is the spine of the timeline: it is the one track guaranteed to
    // exist at every rung, so a gap in it is a real gap rather than a rung that
    // simply had no video.
    return manifest.segments.a.map((segment) => ({
      atSec: segment.capturedAt,
      coversSec: segment.coversSec,
      rung: segment.rung,
    }));
  }, [manifest]);

  if (error) {
    return (
      <Centered
        title="Lien invalide ou expiré"
        detail="Demandez à la personne qui a partagé le lien de vous en envoyer un nouveau."
      />
    );
  }
  if (!manifest) {
    return <Centered title="Chargement…" detail="Nous récupérons l'événement." />;
  }

  const atLiveEdge = playheadSec === null;
  const shown = atLiveEdge ? manifest.status : statusAt(manifest, playheadSec);
  const accent = toneColour[shown.tone];

  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
      <View>
        <Text style={[text.title, { color: colour.ink50 }]}>{manifest.eventName}</Text>
        <Text style={[text.data, { color: colour.ink300, marginTop: 2 }]}>
          {manifest.live ? "En direct" : "Enregistrement"} · {timecode(manifest.capturedThroughSec)}
        </Text>
      </View>

      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: `${accent}44`,
          backgroundColor: `${accent}14`,
          padding: space.lg,
        }}
      >
        <Text style={[text.bodyStrong, { color: colour.ink50 }]}>{shown.label}</Text>
        {!atLiveEdge ? (
          <Text style={[text.small, { color: colour.ink300, marginTop: 2 }]}>
            à {timecode(playheadSec)} dans l'enregistrement
          </Text>
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[text.label, { color: colour.ink300 }]}>Qualité au fil de l'événement</Text>
        <SignalLadder
          samples={samples}
          width={width - space.xl * 2}
          height={48}
          durationSec={Math.max(60, manifest.capturedThroughSec)}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[text.data, { color: colour.ink500 }]}>0:00</Text>
          <Text style={[text.data, { color: colour.ink500 }]}>
            {timecode(manifest.capturedThroughSec)}
          </Text>
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        <Text style={[text.label, { color: colour.ink300 }]}>Réception</Text>
        <Text style={[text.body, { color: colour.ink50 }]}>
          Son {percent(manifest.completeness.heardRatio)} · image{" "}
          {percent(manifest.completeness.sawRatio)}
        </Text>
        {manifest.completeness.overallRatio < 1 && !manifest.live ? (
          <Text style={[text.small, { color: colour.ink300 }]}>
            Le reste est encore sur le téléphone du correspondant et arrivera tout seul.
          </Text>
        ) : null}
      </View>

      {!atLiveEdge ? (
        <Pressable onPress={() => setPlayheadSec(null)}>
          <Text style={[text.bodyStrong, { color: colour.signal }]}>Revenir au direct</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          Share.share({
            message: `Suivez ${manifest.eventName} en direct : https://elongo.cd/p/${presenceId}`,
          })
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          minHeight: 52,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colour.ink700,
        }}
      >
        <Share2 size={iconSize} strokeWidth={stroke.icon} color={colour.ink50} />
        <Text style={[text.bodyStrong, { color: colour.ink50 }]}>Partager avec la famille</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * The status at a moment in the past.
 *
 * Derived from the segment covering that instant, which is why the manifest
 * carries a rung per segment rather than one status for the whole event.
 */
function statusAt(manifest: Manifest, atSec: number) {
  const segment = manifest.segments.a.find(
    (s) => s.capturedAt <= atSec && atSec < s.capturedAt + s.coversSec,
  );
  if (!segment) {
    return { label: "Aucune donnée à ce moment", tone: "buffering" as const };
  }
  if (segment.rung >= 7) return { label: "Connexion perdue à ce moment", tone: "offline" as const };
  if (segment.rung >= 6) return { label: "Audio seul à ce moment", tone: "degraded" as const };
  if (segment.rung >= 3) return { label: "Réseau chargé à ce moment", tone: "degraded" as const };
  return { label: "Bonne connexion à ce moment", tone: "good" as const };
}

function Centered({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={{ flex: 1, padding: space.xl, justifyContent: "center" }}>
      <Text style={[text.title, { color: colour.ink50 }]}>{title}</Text>
      <Text style={[text.body, { color: colour.ink300, marginTop: space.sm }]}>{detail}</Text>
    </View>
  );
}
