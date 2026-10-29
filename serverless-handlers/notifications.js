import { logApiError, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

const NOTIFICATION_FIELDS =
  "id, actor_id, actor_name, actor_avatar, notification_type, project_id, project_title, is_read, created_at";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "PATCH"])) {
    return;
  }

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to view notifications." });
      return;
    }

    if (req.method === "PATCH") {
      const { data, error } = await client
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false)
        .select("id");

      if (error) throw error;
      sendJson(res, 200, { updated: data.length });
      return;
    }

    const { data, error } = await client
      .from("notifications")
      .select(NOTIFICATION_FIELDS)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    sendJson(res, 200, { notifications: data });
  } catch (error) {
    logApiError("Unable to load notifications.", error);
    sendJson(res, 500, { error: "Unable to load notifications." });
  }
}