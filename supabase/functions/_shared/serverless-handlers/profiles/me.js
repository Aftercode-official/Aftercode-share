import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";

const MAX_NAME = 40;
const MAX_BIO = 300;

function sanitizeProfile(body) {
  const updates = {};
  if (Object.hasOwn(body, "displayName")) {
    const v = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!v || v.length > MAX_NAME) return { error: "Display name must be 1–40 characters." };
    updates.display_name = v;
  }
  if (Object.hasOwn(body, "username")) {
    const v = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
    if (v.length > MAX_NAME) return { error: "Username must be 40 characters or fewer." };
    updates.username = v;
  }
  if (Object.hasOwn(body, "bio")) {
    const v = typeof body.bio === "string" ? body.bio.trim() : "";
    if (v.length > MAX_BIO) return { error: "Bio must be 300 characters or fewer." };
    updates.bio = v;
  }
  for (const [field, column, max] of [
    ["avatarUrl", "avatar_url", 500000],
    ["bannerUrl", "banner_url", 2000000],
    ["accentColor", "accent_color", 32],
    ["homeBackground", "home_background", 32],
    ["profileBackground", "profile_background", 32]
  ]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "string" || body[field].length > max) {
        return { error: `Invalid value for ${field}.` };
      }
      updates[column] = body[field];
    }
  }
  for (const field of [
    "showWelcome", "showFeed", "showFeatured",
    "showProfileBio", "showProfileProjects", "showProfileStats"
  ]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "boolean") return { error: `${field} must be a boolean.` };
      const column = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      updates[column] = body[field];
    }
  }
  return { updates };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "PUT"])) {
    return;
  }

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to view your profile." });
      return;
    }

    if (req.method === "GET") {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const fallbackDisplay =
          (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()) ||
          user.email?.split("@")[0] ||
          "Aftercode user";

        const { data: created, error: createError } = await client
          .from("profiles")
          .insert({ user_id: user.id, display_name: fallbackDisplay, username: fallbackDisplay })
          .select("*")
          .single();

        if (createError) throw createError;

        const { count: followersCount } = await client
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", user.id);

        const { count: followingCount } = await client
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", user.id);

        sendJson(res, 200, {
          profile: created,
          followersCount: followersCount ?? 0,
          followingCount: followingCount ?? 0
        });
        return;
      }

      const { count: followersCount } = await client
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", user.id);

      const { count: followingCount } = await client
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", user.id);

      sendJson(res, 200, {
        profile: data,
        followersCount: followersCount ?? 0,
        followingCount: followingCount ?? 0
      });
      return;
    }

    // PUT
    const body = readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: "A JSON object is required." });
      return;
    }
    const validation = sanitizeProfile(body);
    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    const { data, error } = await client
      .from("profiles")
      .upsert(
        { user_id: user.id, ...validation.updates, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    // 🔥 AUTO UPDATE: đồng bộ author mới vào tất cả project của user
    if (validation.updates.display_name) {
      await client
        .from("projects")
        .update({ author: validation.updates.display_name })
        .eq("user_id", user.id);
    }

    sendJson(res, 200, { profile: data });
  } catch (error) {
    logApiError("Unable to process profile request.", error);
    sendJson(res, 500, { error: "Unable to process profile request." });
  }
}