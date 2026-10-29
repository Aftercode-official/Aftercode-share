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
    const { data: publicProjects, error: projectsError } = projectIds.length > 0
      ? await client.from("projects").select("id").in("id", projectIds).eq("is_public", true)
      : { data: [], error: null };

    if (projectsError) {
      throw projectsError;
    }
    const publicProjectIds = new Set(publicProjects.map((project) => project.id));

    sendJson(res, 200, {
      activities: data
        .filter((activity) => !activity.project_id || publicProjectIds.has(activity.project_id))
        .slice(0, 30)
    });
  } catch (error) {
    logApiError("Unable to load community activity.", error);
    sendJson(res, 500, { error: "Unable to load community activity." });
  }
}