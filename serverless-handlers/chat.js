import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { checkRateLimit } from "../server/rateLimit.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

const CHAT_FIELDS = "id, user_id, author, avatar_url, text, media_path, media_type, created_at";
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm"
]);

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;

  try {
    const client = createAdminClient();
    if (req.method === "GET") {
      const { data, error } = await client.from("chat_messages")
        .select(CHAT_FIELDS).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const userIds = [...new Set(data.map((message) => message.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await client.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=10");
      sendJson(res, 200, {
        messages: data.reverse().map((message) => {
          const profile = profileMap.get(message.user_id);
          return {
            ...message,
            author: profile?.display_name?.trim() || message.author,
            avatar_url: profile?.avatar_url || message.avatar_url
          };
        })
      });
      return;
    }

    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to send a chat message." });
      return;
    }
    const rateLimit = await checkRateLimit(client, `chat-message:${user.id}`, 10, 60_000);
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.max(1, rateLimit.retryAfter)));
      sendJson(res, 429, { error: "You are sending chat messages too quickly. Try again shortly." });
      return;
    }
    const body = readJsonBody(req);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const mediaPath = typeof body?.mediaPath === "string" ? body.mediaPath.trim() : "";
    const mediaType = typeof body?.mediaType === "string" ? body.mediaType.trim().toLowerCase() : "";
    if (text.length > 1000 || (!text && !mediaPath)) {
      sendJson(res, 400, { error: "Write a message or attach a photo/video. Messages can be up to 1000 characters." });
      return;
    }
    if (Boolean(mediaPath) !== Boolean(mediaType)
      || (mediaPath && (!mediaPath.startsWith(`${user.id}/`) || mediaPath.includes("..")))
      || (mediaType && !ALLOWED_MEDIA_TYPES.has(mediaType))) {
      sendJson(res, 400, { error: "Invalid chat attachment." });
      return;
    }

    const metadata = user.user_metadata ?? {};
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("display_name, avatar_url").eq("user_id", user.id).maybeSingle();
    if (profileError) throw profileError;
    const author = profile?.display_name?.trim() || (typeof metadata.display_name === "string" && metadata.display_name.trim()
      ? metadata.display_name.trim().slice(0, 80)
      : user.email?.split("@")[0] ?? "Aftercode user");
    const avatarUrl = profile?.avatar_url
      || (typeof metadata.avatar_url === "string" ? metadata.avatar_url.slice(0, 2048) : "");
    const { data, error } = await client.from("chat_messages")
      .insert({
        user_id: user.id,
        author,
        avatar_url: avatarUrl,
        text,
        media_path: mediaPath || null,
        media_type: mediaType || null
      })
      .select(CHAT_FIELDS).single();
    if (error) throw error;
    sendJson(res, 201, { message: data });
  } catch (error) {
    logApiError("Unable to process chat request.", error);
    sendJson(res, 500, { error: "Unable to process the chat request." });
  }
}
