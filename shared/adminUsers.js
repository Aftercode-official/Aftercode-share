// Public user IDs only. Authorization is always enforced again by the server.
export const ADMIN_USER_IDS = Object.freeze([
  "5c7667c5-7119-44fc-bd62-28ba3d4507d0", // katboizz
  "e3d2ee4e-e24f-4f7d-9f31-f92fabc9a628" // thinh1234231t
]);

export function isAdminUserId(userId) {
  return ADMIN_USER_IDS.includes(userId);
}
