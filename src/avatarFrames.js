const BUILT_IN_AVATAR_FRAMES = new Set(["none", "gold", "neon", "pixel", "bear"]);
export const DRAGON_AVATAR_FRAME_ID = "545f6857-05ab-4703-b2c7-ee8bf1a4f0fe";
export const CHIX_ART_AVATAR_FRAME_ID = "de0e06c9-7fbb-4a40-a085-756d408c665c";

export function isDragonAvatarFrame(frameId) {
  return frameId === DRAGON_AVATAR_FRAME_ID;
}

export function isChixArtAvatarFrame(frameId) {
  return frameId === CHIX_ART_AVATAR_FRAME_ID;
}

export function isShopAvatarFrame(frameId) {
  return typeof frameId === "string" && frameId.length > 0 && !BUILT_IN_AVATAR_FRAMES.has(frameId);
}
