import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

async function loadInteractions(client, projectId, userId) {
  const [likes, favorites, comments, liked, favorited] = await Promise.all([
    client.from("project_likes").select("project_id", { count: "exact", head: true }).eq("project_id", projectId),
    client.from("project_favorites").select("project_id", { count: "exact", head: true }).eq("project_id", projectId),
    client.from("project_comments")
      .select("id, user_id, author, avatar_url, text, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(100),
    userId
      ? client.from("project_likes").select("project_id").eq("project_id", projectId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    userId
      ? client.from("project_favorites").select("project_id").eq("project_id", projectId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  for (const result of [likes, favorites, comments, liked, favorited]) {
    if (result.error) throw result.error;
  }

  return {
    likes: likes.count ?? 0,
    liked: Boolean(liked.data),
    favorited: Boolean(favorited.data),
    comments: comments.data.map((comment) => ({
      id: comment.id,
      userId: comment.user_id,
      author: comment.author,
      avatarUrl: comment.avatar_url,
      text: comment.text,
      createdAt: comment.created_at
    }))
  };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) {
    return;
  }

  const projectId = req.query.projectId;
  if (typeof projectId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    sendJson(res, 400, { error: "A valid project ID is required." });
    return;
  }

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);
    const { data: project, error: projectError } = await client
      .from("projects")
      .select("id, user_id, is_public")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project || (!project.is_public && project.user_id !== user?.id)) {
      sendJson(res, 404, { error: "Project not found." });
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, { interaction: await loadInteractions(client, projectId, user?.id) });
      return;
    }

    if (!user) {
      sendJson(res, 401, { error: "Sign in to interact with projects." });
      return;
    }

    const body = readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: "A JSON object is required." });
      return;
    }

    if (body.action === "like" || body.action === "favorite") {
      if (typeof body.enabled !== "boolean") {
        sendJson(res, 400, { error: "A boolean enabled value is required for this action." });
        return;
      }
      const table = body.action === "like" ? "project_likes" : "project_favorites";
      const query = client.from(table);
      const { error } = body.enabled
        ? await query.upsert({ project_id: projectId, user_id: user.id }, { onConflict: "project_id,user_id", ignoreDuplicates: true })
        : await query.delete().eq("project_id", projectId).eq("user_id", user.id);
      if (error) throw error;
    } else if (body.action === "comment") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > 500) {
        sendJson(res, 400, { error: "Comment must contain 1 to 500 characters." });
        return;
      }
      const metadata = user.user_metadata ?? {};
      const displayName = typeof metadata.display_name === "string" && metadata.display_name.trim()
        ? metadata.display_name.trim().slice(0, 80)
        : user.email?.split("@")[0] ?? "Aftercode user";

      const { data: userProfile } = await client
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      const { error } = await client.from("project_comments").insert({
        project_id: projectId,
        user_id: user.id,
        author: displayName,
        avatar_url: userProfile?.avatar_url || "",
        text
      });
      if (error) throw error;
    } else {
      sendJson(res, 400, { error: "Unsupported interaction action." });
      return;
    }

    sendJson(res, 200, { interaction: await loadInteractions(client, projectId, user.id) });
  } catch (error) {
    logApiError("Unable to process project interaction.", error);
    sendJson(res, 500, { error: "Unable to process the project interaction." });
  }
}