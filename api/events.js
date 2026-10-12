import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";
import { env } from "node:process";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) {
    return;
  }

  try {
    const client = createAdminClient();

    if (req.method === "GET") {
      const { data, error } = await client
        .from("events")
        .select("id, title, description, starts_at, location, created_at")
        .eq("is_public", true)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(50);

      if (error) {
        throw error;
      }
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
    if (!eventAdminIds.has(user.id)) {
      sendJson(res, 403, { error: "Only configured event administrators can create events." });
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
    const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : null;
    if (!title || title.length > 120 || description.length > 2000 || location.length > 120
      || !startsAt || Number.isNaN(startsAt.valueOf()) || startsAt <= new Date()) {
      sendJson(res, 400, { error: "Provide a title, valid future start time, and description/location within their limits." });
      return;
    }

    const { data, error } = await client
      .from("events")
      .insert({
        created_by: user.id,
        title,
        description,
        location,
        starts_at: startsAt.toISOString()
      })
      .select("id, title, description, starts_at, location, created_at")
      .single();

    if (error) {
      throw error;
    }
    sendJson(res, 201, { event: data });
  } catch (error) {
    logApiError("Unable to process events request.", error);
    sendJson(res, 500, { error: "Unable to process the events request." });
  }
}
