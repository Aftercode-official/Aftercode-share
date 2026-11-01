import { logApiError, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) {
    return;
  }

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to view community activity." });
      return;
    }

    const { data, error } = await client
      .from("activities")
      .select("id, actor_id, actor_name, actor_avatar, activity_type, project_id, project_title, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    const projectIds = [...new Set(data.map((activity) => activity.project_id).filter(Boolean))];
    const actorIds = [...new Set(data.map((activity) => activity.actor_id).filter(Boolean))];
    const [projectsResult, profilesResult] = await Promise.all([
      projectIds.length > 0
        ? client.from("projects").select("id").in("id", projectIds).eq("is_public", true)
        : Promise.resolve({ data: [], error: null }),
      actorIds.length > 0
        ? client.from("profiles").select("user_id, avatar_url").in("user_id", actorIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    const publicProjectIds = new Set((projectsResult.data ?? []).map((project) => project.id));
    const avatarByUserId = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile.avatar_url]));

    sendJson(res, 200, {
      activities: data
        .filter((activity) => !activity.project_id || publicProjectIds.has(activity.project_id))
        .map((activity) => ({
          ...activity,
          actor_avatar: avatarByUserId.get(activity.actor_id) || activity.actor_avatar || ""
        }))
        .slice(0, 30)
    });
  } catch (error) {
    logApiError("Unable to load community activity.", error);
    sendJson(res, 500, { error: "Unable to load community activity." });
  }
}
