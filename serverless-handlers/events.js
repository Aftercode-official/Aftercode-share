import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";
import { env } from "node:process";
import { broadcastNotification } from "../server/broadcast.js";
import { isAdminUserId } from "../shared/adminUsers.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "DELETE"])) {
    return;
  }

  try {
    const client = createAdminClient();

    if (req.method === "GET") {
      const { data, error } = await client
        .from("events")
        .select("id, title, description, starts_at, location, thumbnail_url, created_at")
        .eq("is_public", true)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(50);

      if (error) {
        throw error;
      }
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
      sendJson(res, 200, { events: data });
      return;
    }

    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to create an event." });
      return;
    }
    const eventAdminIds = new Set(
      (env.EVENT_ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean)
    );
    const isEventAdmin = isAdminUserId(user.id) || eventAdminIds.has(user.id);
    if (!isEventAdmin) {
      sendJson(res, 403, { error: "Only configured event administrators can create events." });
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (typeof id !== "string" || !(/^[0-9]+$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
        sendJson(res, 400, { error: "A valid event ID is required." });
        return;
      }
      const { data: event, error: findError } = await client
        .from("events")
        .select("id, thumbnail_url")
        .eq("id", id)
        .maybeSingle();
      if (findError) throw findError;
      if (!event) {
        sendJson(res, 404, { error: "Event not found." });
        return;
      }

      const { error: notificationsError } = await client.from("notifications").delete().eq("event_id", event.id);
      if (notificationsError) throw notificationsError;
      const { error: deleteError } = await client.from("events").delete().eq("id", event.id);
      if (deleteError) throw deleteError;
      if (event.thumbnail_url) {
        const { error: storageError } = await client.storage.from("project-files").remove([event.thumbnail_url]);
        if (storageError) console.error("Unable to remove deleted event thumbnail.", storageError);
      }
      sendJson(res, 200, { deleted: true, id: event.id });
      return;
    }

    const body = readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: "A JSON object is required." });
      return;
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const thumbnailPath = typeof body.thumbnailPath === "string" ? body.thumbnailPath.trim() : "";
    const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : null;
    if (!title || title.length > 120 || description.length > 2000 || location.length > 120
      || !startsAt || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()
      || !thumbnailPath.startsWith(`${user.id}/event-thumbnails/`)) {
      sendJson(res, 400, { error: "Provide a title, valid future start time, event thumbnail, and description/location within their limits." });
      return;
    }

    const { data, error } = await client
      .from("events")
      .insert({
        created_by: user.id,
        title,
        description,
        location,
        thumbnail_url: thumbnailPath,
        starts_at: startsAt.toISOString()
      })
      .select("id, title, description, starts_at, location, thumbnail_url, created_at")
      .single();

    if (error) {
      throw error;
    }
    let sent;
    try {
      sent = await broadcastNotification(client, {
        actorId: user.id,
        actorName: "Aftercode Events",
        actorAvatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || "",
        type: "event",
        title,
        message: [description, location ? `Location: ${location}` : "", `Starts: ${startsAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC`].filter(Boolean).join("\n"),
        thumbnailPath,
        eventId: data.id
      });
    } catch (broadcastError) {
      await client.from("events").delete().eq("id", data.id);
      throw broadcastError;
    }
    sendJson(res, 201, { event: data, sent });
  } catch (error) {
    logApiError("Unable to process events request.", error);
    sendJson(res, 500, { error: "Unable to process the events request." });
  }
}
