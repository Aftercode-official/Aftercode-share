import { logApiError, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

const NOTIFICATION_FIELDS =
  "id, actor_id, actor_name, actor_avatar, notification_type, project_id, project_title, message, thumbnail_url, event_id, is_read, created_at";

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
      .neq("notification_type", "announcement")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    const actorIds = [...new Set(data.map((notification) => notification.actor_id).filter(Boolean))];
    const { data: profiles, error: profilesError } = actorIds.length > 0
      ? await client.from("profiles").select("user_id, avatar_url").in("user_id", actorIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const avatarByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.avatar_url]));
    sendJson(res, 200, {
      notifications: data.map((notification) => ({
        ...notification,
        actor_avatar: avatarByUserId.get(notification.actor_id) || notification.actor_avatar || ""
      }))
    });
  } catch (error) {
    logApiError("Unable to load notifications.", error);
    sendJson(res, 500, { error: "Unable to load notifications." });
  }
}
