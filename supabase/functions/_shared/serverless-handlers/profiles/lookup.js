import { logApiError, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient } from "../../server/supabase.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) {
    return;
  }

  const username = typeof req.query.username === "string"
    ? req.query.username.trim().replace(/^@/, "")
    : "";

  if (!username || username.length > 40) {
    sendJson(res, 400, { error: "" });
    return;
  }

  try {
    const client = createAdminClient();

    const { data, error } = await client
      .from("profiles")
      .select("user_id, username")
      .ilike("username", username)
      .maybeSingle();

    if (error) throw error;
    if (!data?.user_id) {
      sendJson(res, 404, { error: "" });
      return;
    }

    sendJson(res, 200, { userId: data.user_id, username: data.username });
  } catch (error) {
    logApiError("", error);
    sendJson(res, 500, { error: "" });
  }
}
