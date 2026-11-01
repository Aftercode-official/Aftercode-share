import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) {
    return;
  }

  try {
    const client = createAdminClient();

    if (req.method === "GET") {
      const userId = req.query.userId;
      const list = req.query.list;

      if (typeof userId !== "string" || !UUID_RE.test(userId)) {
        sendJson(res, 400, { error: "A valid user ID is required." });
        return;
      }

      const { count: followersCount, error: followersError } = await client
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", userId);

      if (followersError) throw followersError;

      const { count: followingCount, error: followingError } = await client
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", userId);

      if (followingError) throw followingError;

      const currentUser = await getAuthenticatedUser(client, req);
      let isFollowing = false;
      if (currentUser) {
        const { data: rel } = await client
          .from("follows")
          .select("follower_id")
          .eq("follower_id", currentUser.id)
          .eq("following_id", userId)
          .maybeSingle();
        isFollowing = Boolean(rel);
      }

      if (list !== "followers" && list !== "following") {
        sendJson(res, 200, {
          followersCount: followersCount ?? 0,
          followingCount: followingCount ?? 0,
          isFollowing
        });
        return;
      }

      const { data: rows, error: rowsError } = list === "followers"
        ? await client.from("follows").select("follower_id").eq("following_id", userId)
        : await client.from("follows").select("following_id").eq("follower_id", userId);

      if (rowsError) throw rowsError;

      const ids = (rows ?? []).map((r) => r.follower_id ?? r.following_id);

      if (ids.length === 0) {
        sendJson(res, 200, { users: [] });
        return;
      }

      const { data: profiles, error: profilesError } = await client
        .from("profiles")
        .select("user_id, display_name, username, avatar_url")
        .in("user_id", ids);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const users = ids.map((id) => {
        const p = profileMap.get(id);
        return {
          user_id: id,
          display_name: p?.display_name || "Aftercode user",
          username: p?.username || "",
          avatar_url: p?.avatar_url || ""
        };
      });

      sendJson(res, 200, { users });
      return;
    }

    // POST — follow / unfollow
    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to follow users." });
      return;
    }

    const body = readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: "A JSON object is required." });
      return;
    }

    const targetId = typeof body.userId === "string" ? body.userId : "";
    const enabled = body.enabled;

    if (!UUID_RE.test(targetId)) {
      sendJson(res, 400, { error: "A valid target user ID is required." });
      return;
    }
    if (targetId === user.id) {
      sendJson(res, 400, { error: "You cannot follow yourself." });
      return;
    }
    if (typeof enabled !== "boolean") {
      sendJson(res, 400, { error: "enabled must be a boolean." });
      return;
    }

    const actorName =
      (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()) ||
      user.email?.split("@")[0] ||
      "Aftercode user";

    // Lấy avatar từ profile
    const { data: actorProfile } = await client
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    const actorAvatar = actorProfile?.avatar_url || "";

    if (enabled) {
      const { data: existing } = await client
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("following_id", targetId)
        .maybeSingle();

      const { error } = await client
        .from("follows")
        .upsert(
          { follower_id: user.id, following_id: targetId },
          { onConflict: "follower_id,following_id", ignoreDuplicates: true }
        );
      if (error) throw error;

      if (!existing) {
        const { error: notificationError } = await client.from("notifications").insert({
          recipient_id: targetId,
          actor_id: user.id,
          actor_name: actorName,
          actor_avatar: actorAvatar,
          notification_type: "follow",
          project_id: null,
          project_title: null
        });
        if (notificationError) throw notificationError;

        const { error: activityError } = await client.from("activities").insert({
          actor_id: user.id,
          actor_name: actorName,
          actor_avatar: actorAvatar,
          activity_type: "follow",
          project_id: null,
          project_title: null
        });
        if (activityError) throw activityError;
      }
    } else {
      const { error } = await client
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetId);
      if (error) throw error;
    }

    const { count } = await client
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", targetId);

    sendJson(res, 200, {
      isFollowing: enabled,
      followersCount: count ?? 0
    });
  } catch (error) {
    logApiError("Unable to process follow request.", error);
    sendJson(res, 500, { error: "Unable to process follow request." });
  }
}
