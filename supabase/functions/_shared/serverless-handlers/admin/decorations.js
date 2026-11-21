import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";
import { isAdminUserId } from "../../shared/adminUsers.js";

function toDecoration(client, item) {
  return {
    ...item,
    imageUrl: client.storage.from("project-files").getPublicUrl(item.image_path).data.publicUrl
  };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "PATCH"])) return;

  try {
    const client = createAdminClient();
    const admin = await getAuthenticatedUser(client, req);
    if (!admin) {
      sendJson(res, 401, { error: "Sign in to manage profile decorations." });
      return;
    }
    if (!isAdminUserId(admin.id)) {
      sendJson(res, 403, { error: "Only the Aftercode administrator can manage profile decorations." });
      return;
    }

    if (req.method === "GET") {
      const { data, error } = await client.from("profile_decorations")
        .select("id, name, author, description, image_path, price, is_active, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      sendJson(res, 200, { decorations: (data ?? []).map((item) => toDecoration(client, item)) });
      return;
    }

    const body = readJsonBody(req);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const author = typeof body?.author === "string" ? body.author.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const imagePath = typeof body?.imagePath === "string" ? body.imagePath : "";
    const price = Number(body?.price);
    if (req.method === "PATCH") {
      const id = typeof body?.id === "string" ? body.id : "";
      if (body?.action !== "remove" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        sendJson(res, 400, { error: "Choose a valid frame to remove from the shop." });
        return;
      }
      const { data, error } = await client.from("profile_decorations")
        .update({ is_active: false })
        .eq("id", id)
        .select("id, name, author, description, image_path, price, is_active, created_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        sendJson(res, 404, { error: "Profile frame not found." });
        return;
      }
      sendJson(res, 200, { decoration: toDecoration(client, data) });
      return;
    }

    if (!name || name.length > 60 || !author || author.length > 60 || description.length > 300) {
      sendJson(res, 400, { error: "Enter a frame name and author (1–60 characters each), with a description up to 300 characters." });
      return;
    }
    if (!Number.isInteger(price) || price < 1 || price > 100000) {
      sendJson(res, 400, { error: "Price must be a whole number between 1 and 100,000 credits." });
      return;
    }
    if (!imagePath.startsWith(`${admin.id}/profile-decorations/`) || imagePath.includes("..") || imagePath.length > 300) {
      sendJson(res, 400, { error: "Upload the frame image to the profile decoration folder first." });
      return;
    }

    const { data, error } = await client.from("profile_decorations")
      .insert({
        name,
        author,
        description,
        image_path: imagePath,
        price,
        created_by: admin.id
      })
      .select("id, name, author, description, image_path, price, is_active, created_at")
      .single();
    if (error) throw error;
    sendJson(res, 201, { decoration: toDecoration(client, data) });
  } catch (error) {
    logApiError("Unable to manage profile decorations.", error);
    sendJson(res, 500, { error: "Unable to manage profile decorations." });
  }
}
