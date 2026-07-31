import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUFFERED_RUNG_INDEX,
  RUNG_COUNT,
  barHeight,
  colourForRung,
  ladderGeometry,
  rungAtSec,
  type LadderSample,
} from "../src/ladder-geometry.ts";
import { NBSP, bitrate, dataSize, humanDuration, money, percent, timecode } from "../src/format.ts";
import { colour, rungColour, tone } from "../src/tokens.ts";
import { text } from "../src/type.ts";

// ------------------------------------------------------------------ tokens --

test("every rung has a colour", () => {
  assert.equal(rungColour.length, RUNG_COUNT);
  for (const c of rungColour) assert.match(c, /^#[0-9A-Fa-f]{6}$/);
});

test("the four tones are distinct colours", () => {
  const values = new Set(Object.values(tone));
  assert.equal(values.size, 4, "two tones share a colour, so they cannot be told apart");
});

test("outage and good never share a hue family", () => {
  assert.notEqual(tone.offline, tone.good);
  assert.equal(tone.offline, colour.brick);
});

test("the type scale has no zero line heights", () => {
  for (const [name, style] of Object.entries(text)) {
    assert.ok(style.lineHeight > style.fontSize * 0.9, `${name} line height is too tight`);
    assert.ok(style.fontSize >= 12, `${name} is below the 12px floor`);
  }
});

test("uppercase labels carry positive tracking and nothing else does", () => {
  assert.ok(text.label.letterSpacing > 0);
  assert.ok(text.display.letterSpacing < 0, "display should be tightened");
});

// ------------------------------------------------------- ladder geometry --

const HEIGHT = 40;

test("an empty timeline draws nothing rather than throwing", () => {
  const g = ladderGeometry([], { width: 300, height: HEIGHT });
  assert.deepEqual(g.bars, []);
  assert.deepEqual(g.outages, []);
});

test("zero width draws nothing rather than dividing by zero", () => {
  const g = ladderGeometry([{ atSec: 0, coversSec: 10, rung: 0 }], { width: 0, height: HEIGHT });
  assert.deepEqual(g.bars, []);
});

test("bars tile the full width without overlapping", () => {
  const samples: LadderSample[] = [{ atSec: 0, coversSec: 600, rung: 1 }];
  const g = ladderGeometry(samples, { width: 300, height: HEIGHT, barPitch: 6, barGap: 2 });
  assert.equal(g.bars.length, 50);
  for (let i = 1; i < g.bars.length; i += 1) {
    const prev = g.bars[i - 1];
    assert.ok(prev.x + prev.width <= g.bars[i].x + 1e-9, `bar ${i} overlaps its neighbour`);
  }
  const last = g.bars[g.bars.length - 1];
  assert.ok(last.x + last.width <= 300 + 1e-9, "the last bar overflows the width");
});

test("bars sit on the baseline", () => {
  const g = ladderGeometry([{ atSec: 0, coversSec: 60, rung: 2 }], { width: 120, height: HEIGHT });
  for (const bar of g.bars) {
    assert.ok(Math.abs(bar.y + bar.height - HEIGHT) < 1e-9, "bar is not anchored to the baseline");
  }
});

test("REGRESSION: a bucket takes the worst rung, never the mean", () => {
  // A thirty-second outage inside a five-minute bucket must still show as an
  // outage. Averaging is how the web player ended up unable to say when the
  // network failed.
  const samples: LadderSample[] = [
    { atSec: 0, coversSec: 300, rung: 0 },
    { atSec: 120, coversSec: 30, rung: BUFFERED_RUNG_INDEX },
  ];
  const g = ladderGeometry(samples, { width: 60, height: HEIGHT, barPitch: 30, barGap: 0 });
  assert.equal(g.bars.length, 2);
  const hit = g.bars.find((b) => b.rung === BUFFERED_RUNG_INDEX);
  assert.ok(hit, "the outage disappeared into the average");
  assert.ok(hit.fromSec <= 120 && hit.toSec >= 150, "the outage landed in the wrong bucket");
});

test("REGRESSION: an outage is located where it happened, not at the start", () => {
  // The founder's exact complaint about the web player: "the error of internet
  // connection is happening right at the beginning, completely not knowing
  // where it happened... it must report the issue exactly at the very moment it
  // occurred."
  const samples: LadderSample[] = [
    { atSec: 0, coversSec: 3600, rung: 1 },
    { atSec: 2400, coversSec: 120, rung: BUFFERED_RUNG_INDEX },
  ];
  const g = ladderGeometry(samples, { width: 360, height: HEIGHT, barPitch: 6, barGap: 2 });
  assert.equal(g.outages.length, 1);
  const [outage] = g.outages;
  assert.ok(outage.fromSec >= 2340 && outage.fromSec <= 2400, `outage starts at ${outage.fromSec}s`);
  assert.ok(outage.toSec >= 2520 && outage.toSec <= 2580, `outage ends at ${outage.toSec}s`);
  assert.ok(outage.x > 200, "the outage was drawn near the start of the bar");
});

test("adjacent outage buckets merge into one marker", () => {
  // Three ticks read as three outages, which is a different and worse fact than
  // one outage.
  const samples: LadderSample[] = [
    { atSec: 0, coversSec: 600, rung: 1 },
    { atSec: 200, coversSec: 100, rung: BUFFERED_RUNG_INDEX },
  ];
  const g = ladderGeometry(samples, { width: 300, height: HEIGHT, barPitch: 6, barGap: 2 });
  assert.equal(g.outages.length, 1);
  assert.ok(g.outages[0].width > 6, "the merged marker is only one bar wide");
});

test("two separate outages stay separate", () => {
  const samples: LadderSample[] = [
    { atSec: 0, coversSec: 1200, rung: 1 },
    { atSec: 100, coversSec: 60, rung: BUFFERED_RUNG_INDEX },
    { atSec: 900, coversSec: 60, rung: BUFFERED_RUNG_INDEX },
  ];
  const g = ladderGeometry(samples, { width: 300, height: HEIGHT, barPitch: 6, barGap: 2 });
  assert.equal(g.outages.length, 2);
  assert.ok(g.outages[0].toSec < g.outages[1].fromSec);
});

test("a stretch with no data is neither good nor an outage", () => {
  // "We never heard from the phone" and "the phone told us it was offline" are
  // different facts and must not share a colour.
  const g = ladderGeometry([{ atSec: 0, coversSec: 100, rung: 0 }], {
    width: 200,
    height: HEIGHT,
    durationSec: 1000,
    barPitch: 20,
    barGap: 0,
  });
  const unknown = g.bars.filter((b) => b.rung === null);
  assert.ok(unknown.length > 0, "the untouched stretch was coloured as if measured");
  assert.equal(g.outages.length, 0, "silence was reported as an outage");
  assert.notEqual(colourForRung(null), colourForRung(BUFFERED_RUNG_INDEX));
});

test("an outage is drawn short but never invisible", () => {
  const h = barHeight(BUFFERED_RUNG_INDEX, HEIGHT);
  assert.ok(h > 0, "a total outage renders as nothing, which reads as 'never filmed'");
  assert.ok(h < barHeight(0, HEIGHT) / 3, "the outage bar is not visibly shorter than a good one");
});

test("bar height falls monotonically down the ladder", () => {
  for (let i = 1; i < RUNG_COUNT; i += 1) {
    assert.ok(barHeight(i, HEIGHT) <= barHeight(i - 1, HEIGHT), `rung ${i} is taller than rung ${i - 1}`);
  }
});

test("samples arriving out of order produce the same picture", () => {
  const samples: LadderSample[] = [
    { atSec: 0, coversSec: 300, rung: 1 },
    { atSec: 100, coversSec: 20, rung: 6 },
    { atSec: 200, coversSec: 20, rung: 3 },
  ];
  const opts = { width: 150, height: HEIGHT, barPitch: 6, barGap: 2 };
  const forward = ladderGeometry(samples, opts);
  const shuffled = ladderGeometry([samples[2], samples[0], samples[1]], opts);
  assert.deepEqual(shuffled.bars, forward.bars);
});

test("a sample past the declared duration does not escape the bar", () => {
  const g = ladderGeometry([{ atSec: 0, coversSec: 9999, rung: 4 }], {
    width: 100,
    height: HEIGHT,
    durationSec: 60,
    barPitch: 10,
    barGap: 0,
  });
  for (const bar of g.bars) assert.ok(bar.x + bar.width <= 100 + 1e-9);
  assert.equal(g.bars.filter((b) => b.rung === null).length, 0);
});

test("a width narrower than one bar still draws one bar", () => {
  const g = ladderGeometry([{ atSec: 0, coversSec: 60, rung: 2 }], { width: 3, height: HEIGHT, barPitch: 6 });
  assert.equal(g.bars.length, 1);
  assert.ok(g.bars[0].width >= 1);
});

test("rungAtSec answers for the moment asked, not the latest moment", () => {
  const samples: LadderSample[] = [
    { atSec: 0, coversSec: 100, rung: 0 },
    { atSec: 100, coversSec: 50, rung: BUFFERED_RUNG_INDEX },
    { atSec: 150, coversSec: 100, rung: 1 },
  ];
  assert.equal(rungAtSec(samples, 50), 0);
  assert.equal(rungAtSec(samples, 120), BUFFERED_RUNG_INDEX);
  assert.equal(rungAtSec(samples, 200), 1);
});

test("rungAtSec says 'unknown' before the first sample instead of guessing", () => {
  assert.equal(rungAtSec([{ atSec: 10, coversSec: 5, rung: 0 }], 2), null);
  assert.equal(rungAtSec([], 0), null);
});

// ------------------------------------------------------------- formatting --

test("timecodes drop the hour until there is one", () => {
  assert.equal(timecode(7), "0:07");
  assert.equal(timecode(271), "4:31");
  assert.equal(timecode(4929), "1:22:09");
  assert.equal(timecode(-5), "0:00");
});

test("durations read as prose", () => {
  assert.equal(humanDuration(30), `30${NBSP}s`);
  assert.equal(humanDuration(2700), `45${NBSP}min`);
  assert.equal(humanDuration(3600), `1${NBSP}h`);
  assert.equal(humanDuration(12000), `3${NBSP}h${NBSP}20`);
});

test("units are separated by a non-breaking space, not a plain one", () => {
  // A plain space lets "45 min" wrap across a line break on a narrow Android
  // screen, which is wrong in French typography and looks broken.
  for (const s of [humanDuration(2700), dataSize(4_500_000), money(1500), percent(0.5), bitrate(24)]) {
    assert.ok(s.includes(NBSP), `"${s}" uses a plain space before its unit`);
    assert.ok(!/ [^ ]*$/.test(s.replace(new RegExp(NBSP, "g"), "\u0000")), `"${s}" contains a stray plain space`);
  }
});

test("data volumes use the units a Congolese bundle is sold in", () => {
  assert.equal(dataSize(900), `900${NBSP}o`);
  assert.equal(dataSize(45_000), `45${NBSP}ko`);
  assert.equal(dataSize(4_500_000), `4,5${NBSP}Mo`);
  assert.equal(dataSize(450_000_000), `450${NBSP}Mo`);
  assert.equal(dataSize(2_400_000_000), `2,4${NBSP}Go`);
});

test("money uses a comma and a space before the symbol", () => {
  assert.equal(money(1500), `15,00${NBSP}\u20AC`);
  assert.equal(money(3999), `39,99${NBSP}\u20AC`);
  assert.equal(money(123456789), `1${NBSP}234${NBSP}567,89${NBSP}\u20AC`);
  assert.equal(money(-500), `-5,00${NBSP}\u20AC`);
});

test("francs are whole and carry no decimals", () => {
  assert.equal(money(2557230, "XAF"), `25${NBSP}572${NBSP}FCFA`);
});

test("percent never rounds an incomplete recording up to 100", () => {
  // "Complete" is a promise. Neither 99.97% nor 99.6% may be shown as 100%.
  assert.equal(percent(0.9997), `99,9${NBSP}%`);
  assert.equal(percent(0.996), `99,9${NBSP}%`);
  assert.equal(percent(0.999), `99,9${NBSP}%`);
  assert.equal(percent(1), `100${NBSP}%`);
  assert.equal(percent(0), `0${NBSP}%`);
  assert.equal(percent(0.663), `66${NBSP}%`);
  assert.equal(percent(0.042), `4,2${NBSP}%`);
});

test("percent shows 100 only for a genuinely complete recording", () => {
  for (let i = 0; i < 2000; i += 1) {
    const ratio = i / 2000;
    const shown = percent(ratio);
    assert.ok(shown !== `100${NBSP}%`, `ratio ${ratio} was shown as complete`);
  }
  assert.equal(percent(1), `100${NBSP}%`);
});

test("bitrate switches unit at a megabit", () => {
  assert.equal(bitrate(24), `24${NBSP}kb/s`);
  assert.equal(bitrate(1500), `1,5${NBSP}Mb/s`);
});
