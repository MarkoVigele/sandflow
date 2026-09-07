export const DEFAULT_TEXTURE_PROMPT = "feiner Quarzsand, warm, trocken";

export const BAKED_TEXTURE_FILES = {
  sandDry: "sand-dry-albedo.jpg",
  sandWet: "sand-wet-albedo.jpg",
  woodRim: "wood-rim.jpg",
} as const;

export function bakedTextureUrl(
  file: string,
  base: string = (import.meta.env.BASE_URL as string | undefined) ?? "./",
): string {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}textures/${file}`;
}

export function preferBakedSand(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  return !p || p === DEFAULT_TEXTURE_PROMPT.toLowerCase();
}
