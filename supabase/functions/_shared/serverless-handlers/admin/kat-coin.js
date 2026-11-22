import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";
import { isAdminUserId } from "../../shared/adminUsers.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;

  try {
    const client = createAdminClient();
    const admin = await getAuthenticatedUser(client, req);
    if (!admin) {
      sendJson(res, 401, { error: "Sign in to adjust Kat Coins." });
      return;
    }
    if (!isAdminUserId(admin.id)) {
      sendJson(res, 403, { error: "Only Aftercode administrators can adjust their Kat Coins." });
      return;
    }

    const amount = readJsonBody(req)?.amount;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
      sendJson(res, 400, { error: "Enter a whole number from 1 to 1,000,000,000." });
      return;
    }

    const { data, error } = await client.rpc("admin_grant_kat_coins", {
      p_user_id: admin.id,
      p_amount: amount
    });
    if (error) throw error;
    sendJson(res, 200, { balance: data?.balance ?? data });
  } catch (error) {
    logApiError("Unable to adjust administrator Kat Coins.", error);
    sendJson(res, 500, { error: "Unable to adjust Kat Coins. Apply the latest Kat Coin migration and try again." });
  }
}
