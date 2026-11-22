const BUILT_IN_AVATAR_FRAMES = new Set(["none", "gold", "neon", "pixel", "bear"]);
export const DRAGON_AVATAR_FRAME_ID = "545f6857-05ab-4703-b2c7-ee8bf1a4f0fe";
export const CHIX_ART_AVATAR_FRAME_ID = "de0e06c9-7fbb-4a40-a085-756d408c665c";
export const WHITE_CAT_AVATAR_FRAME_ID = "78d8efec-96ad-449a-afc0-fe3621ee65c3";
export const BUGGY_AVATAR_FRAME_ID = "2869c18f-e179-47b9-a2bd-9928393be4f5";
export const COOL_AVATAR_FRAME_ID = "0d0ec2e3-c6c2-4159-bd9b-fafa2ebeecc6";

export function isDragonAvatarFrame(frameId) {
  return frameId === DRAGON_AVATAR_FRAME_ID;
}

export function isChixArtAvatarFrame(frameId) {
  return frameId === CHIX_ART_AVATAR_FRAME_ID;
}

export function getShopAvatarFrameClass(frameId) {
  if (!isShopAvatarFrame(frameId)) return "";
  if (isChixArtAvatarFrame(frameId)) return " is-shop-avatar-frame is-chix-avatar-frame";
  if (frameId === WHITE_CAT_AVATAR_FRAME_ID) return " is-shop-avatar-frame is-white-cat-avatar-frame";
  if (frameId === BUGGY_AVATAR_FRAME_ID) return " is-shop-avatar-frame is-buggy-avatar-frame";
  if (frameId === COOL_AVATAR_FRAME_ID) return " is-shop-avatar-frame is-cool-avatar-frame";
  return " is-shop-avatar-frame";
}

export function isShopAvatarFrame(frameId) {
  return typeof frameId === "string" && frameId.length > 0 && !BUILT_IN_AVATAR_FRAMES.has(frameId);
}
