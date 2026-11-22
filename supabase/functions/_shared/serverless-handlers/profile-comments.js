import { logApiError, readJsonBody, requireMethod, sendJson } from "./server/http.js";
import { checkRateLimit } from "./server/rateLimit.js";
import { createAdminClient, getAuthenticatedUser } from "./server/supabase.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadProfileComments(client, profileId) {
  const { data, error } = await client.from("profile_comments")
    .select("id, profile_user_id, user_id, author, avatar_url, text, created_at")
    .eq("profile_user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const userIds = [...new Set((data ?? []).map((comment) => comment.user_id).filter(Boolean))];
  const profilesResult = userIds.length
    ? await client.from("profiles").select("user_id, avatar_frame").in("user_id", userIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const avatarFrames = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile.avatar_frame || "none"]));

  return (data ?? []).map((comment) => ({
    id: comment.id,
    profileId: comment.profile_user_id,
    userId: comment.user_id,
    author: comment.author,
    avatarUrl: comment.avatar_url,
    avatarFrame: avatarFrames.get(comment.user_id) || "none",
    text: comment.text,
    createdAt: comment.created_at
  }));
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;

  const profileId = req.method === "GET" ? req.query.profileId : readJsonBody(req)?.profileId;
  if (typeof profileId !== "string" || !UUID_RE.test(profileId)) {
    sendJson(res, 400, { error: "A valid profile ID is required." });
    return;
  }

  try {
    const client = createAdminClient();
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("user_id")
      .eq("user_id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      sendJson(res, 404, { error: "Profile not found." });
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, { comments: await loadProfileComments(client, profileId) });
      return;
    }

    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to comment on profiles." });
      return;
    }
    if (user.id === profileId) {
      sendJson(res, 400, { error: "You can only comment on another user's profile." });
      return;
    }

    const body = readJsonBody(req);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 500) {
      sendJson(res, 400, { error: "Comment must contain 1 to 500 characters." });
      return;
    }

    const rateLimit = await checkRateLimit(client, `profile-comment:${user.id}`, 10, 60_000);
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.max(1, rateLimit.retryAfter)));
      sendJson(res, 429, { error: "You are commenting too quickly. Try again shortly." });
      return;
    }

    const metadata = user.user_metadata ?? {};
    const author = (typeof metadata.display_name === "string" && metadata.display_name.trim()
      ? metadata.display_name.trim()
      : user.email?.split("@")[0] || "Aftercode user").slice(0, 80);
    const { data: actorProfile, error: actorProfileError } = await client.from("profiles")
      .select("avatar_url, avatar_frame")
      .eq("user_id", user.id)
      .maybeSingle();
    if (actorProfileError) throw actorProfileError;

    const { data: comment, error } = await client.from("profile_comments").insert({
      profile_user_id: profileId,
      user_id: user.id,
      author,
      avatar_url: actorProfile?.avatar_url || "",
      text
    }).select("id, profile_user_id, user_id, author, avatar_url, text, created_at").single();
    if (error) throw error;

    sendJson(res, 201, {
      comment: {
        id: comment.id,
        profileId: comment.profile_user_id,
        userId: comment.user_id,
        author: comment.author,
        avatarUrl: comment.avatar_url,
        avatarFrame: actorProfile?.avatar_frame || "none",
        text: comment.text,
        createdAt: comment.created_at
      }
    });
  } catch (error) {
    logApiError("Unable to process profile comments.", error);
    sendJson(res, 500, { error: "Unable to load or post profile comments." });
  }
}
