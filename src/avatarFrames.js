const BUILT_IN_AVATAR_FRAMES = new Set(["none", "gold", "neon", "pixel", "bear"]);
export const DRAGON_AVATAR_FRAME_ID = "545f6857-05ab-4703-b2c7-ee8bf1a4f0fe";

export function isDragonAvatarFrame(frameId) {
  return frameId === DRAGON_AVATAR_FRAME_ID;
}

export function isShopAvatarFrame(frameId) {
  return typeof frameId === "string" && frameId.length > 0 && !BUILT_IN_AVATAR_FRAMES.has(frameId);
}
