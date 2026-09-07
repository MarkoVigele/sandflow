/** Locked Dummy-KI look language. Never sent to a network. */
export const FIXED_INTERNAL_PROMPTS = {
  sandStyle:
    "photoreal laboratory sandbox, beige-gold quartz sand, fine angular grains, macro PBR, natural, not cartoon",
  wetStyle: "wet sand darker, slightly cooler, thin water-film micro gloss",
  waterStyle: "clear shallow water grading to slightly turbid sediment",
  labLight: "soft sun, warm bounce, cool fill, quiet lab interior",
} as const;

export const DEFAULT_USER_PROMPT = "feiner Quarzsand, warm, trocken";

/** UI-Agent wires the Inspector prompt field into AssetProvider.generate(userPrompt). */
export function composeUserPrompt(userPrompt: string): string {
  const user = userPrompt.trim() || DEFAULT_USER_PROMPT;
  return `${FIXED_INTERNAL_PROMPTS.sandStyle}. ${FIXED_INTERNAL_PROMPTS.wetStyle}. User: ${user}`;
}

export interface SandPalette {
  dryA: [number, number, number];
  dryB: [number, number, number];
  pebble: [number, number, number];
  quartz: [number, number, number];
  wetA: [number, number, number];
  wetB: [number, number, number];
  grain: number;
}

const clamp255 = (n: number): number => Math.max(0, Math.min(255, n));

function rgb(r: number, g: number, b: number): [number, number, number] {
  return [r, g, b];
}

function wetShift(c: [number, number, number], mul: number, add: number): [number, number, number] {
  return [
    clamp255(c[0] * mul + add * 0.35),
    clamp255(c[1] * (mul * 0.94) + add * 0.22),
    clamp255(c[2] * (mul * 0.86) + add * 0.12),
  ];
}

/** Parse the user prompt field (DE + EN). Defaults stay beige–gold lab sand. */
export function parseSandPalette(prompt: string): SandPalette {
  const p = prompt.toLowerCase();
  let dryA = rgb(214, 178, 122);
  let dryB = rgb(188, 150, 98);
  let pebble = rgb(138, 108, 74);
  let quartz = rgb(236, 220, 186);
  let grain = 0.55;

  if (/dunkel|basalt|vulkan|schwarz|dark|black|volcanic/.test(p)) {
    dryA = rgb(96, 80, 68);
    dryB = rgb(62, 52, 46);
    pebble = rgb(38, 34, 32);
    quartz = rgb(140, 128, 116);
  } else if (/hell|weiß|weiss|quarz|bleich|pale|white|bleach/.test(p) && !/warm/.test(p)) {
    dryA = rgb(230, 216, 188);
    dryB = rgb(208, 190, 156);
    pebble = rgb(176, 158, 128);
    quartz = rgb(246, 238, 220);
  } else if (/rot|laterit|rost|terra|red|laterite|rust/.test(p)) {
    dryA = rgb(180, 102, 64);
    dryB = rgb(144, 76, 48);
    pebble = rgb(100, 54, 38);
    quartz = rgb(214, 168, 128);
  } else if (/oliv|grün|gruen|moos|olive|green|moss/.test(p)) {
    dryA = rgb(152, 140, 88);
    dryB = rgb(114, 110, 66);
    pebble = rgb(80, 82, 54);
    quartz = rgb(196, 188, 140);
  } else if (/gold|beige|desert|wüste|wueste|sahara/.test(p)) {
    dryA = rgb(222, 184, 118);
    dryB = rgb(196, 154, 90);
    pebble = rgb(148, 112, 70);
    quartz = rgb(240, 224, 180);
  }

  if (/grob|kies|körnig|koernig|rau|coarse|gravel|grit/.test(p)) grain = 0.9;
  if (/fein|mehl|glatt|staub|fine|flour|smooth|dust|silt/.test(p)) grain = 0.28;

  let wetMul = 0.5;
  if (/feucht|nass|naß|wet|damp|moist/.test(p)) wetMul = 0.42;

  return {
    dryA,
    dryB,
    pebble,
    quartz,
    wetA: wetShift(dryA, wetMul, 18),
    wetB: wetShift(dryB, wetMul * 0.96, 14),
    grain,
  };
}
