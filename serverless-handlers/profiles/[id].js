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

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("user_id, display_name, username, bio, avatar_url, banner_url, accent_color, profile_background, created_at")
      .eq("user_id", id)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: projects, error: projectsError } = await client
      .from("projects")
      .select("id, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, created_at")
      .eq("user_id", id)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(100);

    if (projectsError) throw projectsError;

    const { data: followers, error: followersError } = await client
      .from("follows")
      .select("follower_id")
      .eq("following_id", id);

    if (followersError) throw followersError;

    const { data: following, error: followingError } = await client
      .from("follows")
      .select("following_id")
      .eq("follower_id", id);

    if (followingError) throw followingError;

    sendJson(res, 200, {
      profile: profile ?? {
        user_id: id,
        display_name: "Aftercode user",
        username: "",
        bio: "",
        avatar_url: "",
        banner_url: "",
        accent_color: "#ffb700",
        profile_background: "#171513"
      },
      projects: projects ?? [],
      followersCount: followers?.length ?? 0,
      followingCount: following?.length ?? 0
    });
  } catch (error) {
    logApiError("Unable to load user profile.", error);
    sendJson(res, 500, { error: "Unable to load user profile." });
  }
}
