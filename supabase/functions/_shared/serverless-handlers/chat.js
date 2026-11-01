import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { checkRateLimit } from "../server/rateLimit.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";
import { isAdminUserId } from "../shared/adminUsers.js";

const CHAT_FIELDS = "id, user_id, author, avatar_url, text, media_path, media_type, reply_to_message_id, created_at";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm"
]);

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "DELETE"])) return;

  try {
    const client = createAdminClient();
    if (req.method === "GET") {
      const requestedLimit = Number.parseInt(req.query?.limit, 10);
      const pageSize = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 100;
      const before = typeof req.query?.before === "string" ? req.query.before : "";
      const beforeId = typeof req.query?.beforeId === "string" ? req.query.beforeId : "";
      const validBefore = before && Number.isFinite(Date.parse(before));
      const validBeforeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(beforeId);
      let query = client.from("chat_messages").select(CHAT_FIELDS);
      if (validBefore && validBeforeId) {
        query = query.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`);
      } else if (validBefore) {
        query = query.lt("created_at", before);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize + 1);
      if (error) throw error;
      const hasMore = data.length > pageSize;
      const messages = data.slice(0, pageSize).reverse();
      const replyIds = [...new Set(messages.map((message) => message.reply_to_message_id).filter(Boolean))];
      const { data: replies, error: repliesError } = replyIds.length
        ? await client.from("chat_messages").select("id, user_id, author, text, media_type").in("id", replyIds)
        : { data: [], error: null };
      if (repliesError) throw repliesError;
      const userIds = [...new Set([
        ...messages.map((message) => message.user_id),
        ...(replies ?? []).map((message) => message.user_id)
      ])];
      const { data: profiles, error: profilesError } = userIds.length
        ? await client.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      const replyMap = new Map((replies ?? []).map((message) => [message.id, message]));
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=10");
      sendJson(res, 200, {
        hasMore,
        messages: messages.map((message) => {
          const profile = profileMap.get(message.user_id);
          return {
            ...message,
            author: profile?.display_name?.trim() || message.author,
            avatar_url: profile?.avatar_url || message.avatar_url,
            reply_to: replyMap.has(message.reply_to_message_id) ? {
              id: message.reply_to_message_id,
              author: profileMap.get(replyMap.get(message.reply_to_message_id).user_id)?.display_name?.trim()
                || replyMap.get(message.reply_to_message_id).author,
              text: replyMap.get(message.reply_to_message_id).text,
              media_type: replyMap.get(message.reply_to_message_id).media_type
            } : null
          };
        })
      });
      return;
    }

    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to use community chat." });
      return;
    }
    const body = readJsonBody(req);

    if (req.method === "DELETE") {
      const messageId = typeof body?.messageId === "string" ? body.messageId : "";
      if (!UUID_RE.test(messageId)) {
        sendJson(res, 400, { error: "A valid message ID is required." });
        return;
      }
      const { data: target, error: targetError } = await client.from("chat_messages")
        .select("id, user_id, media_path")
        .eq("id", messageId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) {
        sendJson(res, 404, { error: "Message not found." });
        return;
      }
      if (target.user_id !== user.id && !isAdminUserId(user.id)) {
        sendJson(res, 403, { error: "You can only delete your own messages." });
        return;
      }
      const { error: deleteError } = await client.from("chat_messages").delete().eq("id", messageId);
      if (deleteError) throw deleteError;
      if (target.media_path) {
        const { error: storageError } = await client.storage.from("chat-media").remove([target.media_path]);
        if (storageError) logApiError("Unable to remove deleted chat media.", storageError);
      }
      sendJson(res, 200, { deleted: true, messageId });
      return;
    }

    if (body?.action === "report") {
      const messageId = typeof body.messageId === "string" ? body.messageId : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!UUID_RE.test(messageId) || !reason || reason.length > 500) {
        sendJson(res, 400, { error: "Choose a message and provide a report reason (up to 500 characters)." });
        return;
      }
      const rateLimit = await checkRateLimit(client, `chat-report:${user.id}`, 5, 60_000);
      if (!rateLimit.ok) {
        res.setHeader("Retry-After", String(Math.max(1, rateLimit.retryAfter)));
        sendJson(res, 429, { error: "You are reporting messages too quickly. Try again shortly." });
        return;
      }
      const { data: target, error: targetError } = await client.from("chat_messages")
        .select("id, user_id, author, text, media_type")
        .eq("id", messageId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) {
        sendJson(res, 404, { error: "Message not found." });
        return;
      }
      if (target.user_id === user.id) {
        sendJson(res, 400, { error: "You cannot report your own message." });
        return;
      }
      const { data: existing, error: existingError } = await client.from("chat_message_reports")
        .select("id")
        .eq("reporter_id", user.id)
        .eq("message_id", messageId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        sendJson(res, 409, { error: "You already reported this message." });
        return;
      }
      const { error: reportError } = await client.from("chat_message_reports").insert({
        message_id: target.id,
        reported_user_id: target.user_id,
        reporter_id: user.id,
        reason,
        message_text: target.text,
        message_author: target.author,
        media_type: target.media_type
      });
      if (reportError?.code === "23505") {
        sendJson(res, 409, { error: "You already reported this message." });
        return;
      }
      if (reportError) throw reportError;
      sendJson(res, 201, { reported: true });
      return;
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const mediaPath = typeof body?.mediaPath === "string" ? body.mediaPath.trim() : "";
    const mediaType = typeof body?.mediaType === "string" ? body.mediaType.trim().toLowerCase() : "";
    const replyToMessageId = typeof body?.replyToMessageId === "string" ? body.replyToMessageId : "";
    if (text.length > 1000 || (!text && !mediaPath)) {
      sendJson(res, 400, { error: "Write a message or attach a photo/video. Messages can be up to 1000 characters." });
      return;
    }
    if (replyToMessageId && !UUID_RE.test(replyToMessageId)) {
      sendJson(res, 400, { error: "The message being replied to is invalid." });
      return;
    }
    if (Boolean(mediaPath) !== Boolean(mediaType)
      || (mediaPath && (!mediaPath.startsWith(`${user.id}/`) || mediaPath.includes("..")))
      || (mediaType && !ALLOWED_MEDIA_TYPES.has(mediaType))) {
      sendJson(res, 400, { error: "Invalid chat attachment." });
      return;
    }

    let replyTo = null;
    if (replyToMessageId) {
      const { data: target, error: replyError } = await client.from("chat_messages")
        .select("id, user_id, author, text, media_type")
        .eq("id", replyToMessageId)
        .maybeSingle();
      if (replyError) throw replyError;
      if (!target) {
        sendJson(res, 400, { error: "The message being replied to no longer exists." });
        return;
      }
      replyTo = { id: target.id, author: target.author, text: target.text, media_type: target.media_type };
    }

    const metadata = user.user_metadata ?? {};
    const [rateLimit, profileResult] = await Promise.all([
      checkRateLimit(client, `chat-message:${user.id}`, 10, 60_000),
      client.from("profiles").select("display_name, avatar_url").eq("user_id", user.id).maybeSingle()
    ]);
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.max(1, rateLimit.retryAfter)));
      sendJson(res, 429, { error: "You are sending chat messages too quickly. Try again shortly." });
      return;
    }
    const { data: profile, error: profileError } = profileResult;
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
        media_type: mediaType || null,
        reply_to_message_id: replyToMessageId || null
      })
      .select(CHAT_FIELDS).single();
    if (error) throw error;
    sendJson(res, 201, { message: { ...data, reply_to: replyTo } });
  } catch (error) {
    logApiError("Unable to process chat request.", error);
    sendJson(res, 500, { error: "Unable to process the chat request." });
  }
}
