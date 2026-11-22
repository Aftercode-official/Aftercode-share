const BUILT_IN_AVATAR_FRAMES = new Set(["none", "gold", "neon", "pixel", "bear"]);

export function isShopAvatarFrame(frameId) {
  return typeof frameId === "string" && frameId.length > 0 && !BUILT_IN_AVATAR_FRAMES.has(frameId);
}
