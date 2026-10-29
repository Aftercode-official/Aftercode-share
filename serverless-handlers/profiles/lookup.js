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
    sendJson(res, 400, { error: "A valid username is required." });
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
    if (!data) {
      sendJson(res, 404, { error: "No account found with that username." });
      return;
    }

    // Lấy email từ auth.users thông qua admin API
    const { data: userData, error: userError } = await client.auth.admin.getUserById(data.user_id);
    if (userError) throw userError;

    sendJson(res, 200, { email: userData.user?.email ?? "" });
  } catch (error) {
    logApiError("Unable to look up username.", error);
    sendJson(res, 500, { error: "Unable to look up username." });
  }
}