import { logApiError, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient } from "../../server/supabase.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) {
    return;
  }

  const id = req.query.id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    sendJson(res, 400, { error: "A valid user ID is required." });
    return;
  }

  try {
    const client = createAdminClient();

    const viewerId = req.authenticatedUser?.id ?? null;
    const [profileResult, projectsResult, favoriteIdsResult, followersResult, followingResult, viewerFollowResult] = await Promise.all([
      client.from("profiles")
        .select("user_id, display_name, username, bio, avatar_url, banner_url, accent_color, profile_background, created_at")
        .eq("user_id", id)
        .maybeSingle(),
      client.from("projects")
        .select("id, project_number, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, view_count, created_at")
        .eq("user_id", id)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(100),
      client.from("project_favorites")
        .select("project_id")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      client.from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", id),
      client.from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", id),
      viewerId && viewerId !== id
        ? client.from("follows")
          .select("follower_id")
          .eq("follower_id", viewerId)
          .eq("following_id", id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    if (profileResult.error) throw profileResult.error;
    if (projectsResult.error) throw projectsResult.error;
    if (favoriteIdsResult.error) throw favoriteIdsResult.error;
    if (followersResult.error) throw followersResult.error;
    if (followingResult.error) throw followingResult.error;
    if (viewerFollowResult.error) throw viewerFollowResult.error;

    const favoriteIds = (favoriteIdsResult.data ?? []).map((favorite) => favorite.project_id);
    let favoriteProjects = [];
    if (favoriteIds.length > 0) {
      const { data, error } = await client.from("projects")
        .select("id, project_number, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, view_count, created_at")
        .in("id", favoriteIds)
        .eq("is_public", true);
      if (error) throw error;
      const byId = new Map((data ?? []).map((project) => [project.id, project]));
      favoriteProjects = favoriteIds.map((favoriteId) => byId.get(favoriteId)).filter(Boolean);
    }

    res.setHeader("Cache-Control", viewerId
      ? "private, no-store"
      : "public, max-age=0, s-maxage=15, stale-while-revalidate=60");
    sendJson(res, 200, {
      profile: profileResult.data ?? {
        user_id: id,
        display_name: "Aftercode user",
        username: "",
        bio: "",
        avatar_url: "",
        banner_url: "",
        accent_color: "#ffb700",
        profile_background: "#171513"
      },
      projects: projectsResult.data ?? [],
      favoriteProjects,
      favoritesCount: favoriteProjects.length,
      followersCount: followersResult.count ?? 0,
      followingCount: followingResult.count ?? 0,
      isFollowing: Boolean(viewerFollowResult.data)
    });
  } catch (error) {
    logApiError("Unable to load user profile.", error);
    sendJson(res, 500, { error: "Unable to load user profile." });
  }
}
