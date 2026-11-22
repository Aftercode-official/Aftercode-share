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

    const { data: loadedNotifications, error } = await client
      .from("notifications")
      .select(NOTIFICATION_FIELDS)
      .eq("recipient_id", user.id)
      .neq("notification_type", "announcement")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    let data = loadedNotifications ?? [];
    const eventNotifications = data.filter((notification) => notification.notification_type === "event");
    const eventIds = [...new Set(eventNotifications.map((notification) => notification.event_id).filter(Boolean))];
    const activeEventsResult = eventIds.length > 0
      ? await client.from("events").select("id").in("id", eventIds)
      : { data: [], error: null };
    if (activeEventsResult.error) throw activeEventsResult.error;
    const activeEventIds = new Set((activeEventsResult.data ?? []).map((event) => String(event.id)));
    const staleEventNotificationIds = eventNotifications
      .filter((notification) => !notification.event_id || !activeEventIds.has(String(notification.event_id)))
      .map((notification) => notification.id);
    if (staleEventNotificationIds.length > 0) {
      const { error: cleanupError } = await client.from("notifications").delete()
        .eq("recipient_id", user.id)
        .in("id", staleEventNotificationIds);
      if (cleanupError) throw cleanupError;
      const staleIds = new Set(staleEventNotificationIds);
      data = data.filter((notification) => !staleIds.has(notification.id));
    }
    const actorIds = [...new Set(data.map((notification) => notification.actor_id).filter(Boolean))];
    const validEventIds = [...new Set(data
      .filter((notification) => notification.notification_type === "event")
      .map((notification) => notification.event_id)
      .filter(Boolean))];
    const [profilesResult, eventsResult] = await Promise.all([
      actorIds.length > 0
        ? client.from("profiles").select("user_id, avatar_url").in("user_id", actorIds)
        : Promise.resolve({ data: [], error: null }),
      validEventIds.length > 0
        ? client.from("events").select("id, custom_css").in("id", validEventIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    const { data: profiles, error: profilesError } = profilesResult;
    const { data: events, error: eventsError } = eventsResult;
    if (profilesError) throw profilesError;
    if (eventsError) throw eventsError;
    const avatarByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.avatar_url]));
    const customCssByEventId = new Map((events ?? []).map((event) => [String(event.id), event.custom_css || ""]));
    sendJson(res, 200, {
      notifications: data.map((notification) => ({
        ...notification,
        actor_avatar: avatarByUserId.get(notification.actor_id) || notification.actor_avatar || "",
        custom_css: customCssByEventId.get(String(notification.event_id)) || ""
      }))
    });
  } catch (error) {
    logApiError("Unable to load notifications.", error);
    sendJson(res, 500, { error: "Unable to load notifications." });
  }
}
