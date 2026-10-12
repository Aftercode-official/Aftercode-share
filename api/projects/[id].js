import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
const SCRATCH_PROJECT_ID = /^\d{1,20}$/;

function validateUpdates(body) {
  const updates = {};

  if (Object.hasOwn(body, "title")) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) {
      return { error: "Title must contain 1 to 120 characters." };
    }
    updates.title = title;
  }
  if (Object.hasOwn(body, "scratchProjectId")) {
    const scratchProjectId = typeof body.scratchProjectId === "string"
      ? body.scratchProjectId.trim()
      : "";
    if (!SCRATCH_PROJECT_ID.test(scratchProjectId)) {
      return { error: "A valid Scratch project ID is required." };
    }
    updates.scratch_project_id = scratchProjectId;
  }
  if (Object.hasOwn(body, "description")) {
    if (typeof body.description !== "string" || body.description.trim().length > 2000) {
      return { error: "Description must be a string of 2000 characters or fewer." };
    }
    updates.description = body.description.trim();
  }
  if (Object.hasOwn(body, "category")) {
    const category = typeof body.category === "string" ? body.category.trim() : "";
    if (!category || category.length > 60) {
      return { error: "Category must contain 1 to 60 characters." };
    }
    updates.category = category;
  }
  if (Object.hasOwn(body, "tags")) {
    if (!Array.isArray(body.tags) || body.tags.length > MAX_TAGS
      || body.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > MAX_TAG_LENGTH)) {
      return { error: `Tags must contain at most ${MAX_TAGS} non-empty strings of ${MAX_TAG_LENGTH} characters or fewer.` };
    }
    updates.tags = body.tags.map((tag) => tag.trim());
  }
  if (Object.hasOwn(body, "isPublic")) {
    if (typeof body.isPublic !== "boolean") {
      return { error: "isPublic must be a boolean." };
    }
    updates.is_public = body.isPublic;
  }
  if (Object.keys(updates).length === 0) {
    return { error: "Provide at least one supported project field to update." };
  }

  return { updates: { ...updates, updated_at: new Date().toISOString() } };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "PATCH", "DELETE"])) {
    return;
  }

  const id = req.query.id;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    sendJson(res, 400, { error: "A valid project ID is required." });
    return;
  }

  try {
    const client = createAdminClient();

    if (req.method === "GET") {
      const { data, error } = await client
        .from("projects")
        .select("id, user_id, title, author, scratch_project_id, asset_path, description, category, tags, is_public, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        sendJson(res, 404, { error: "Project not found." });
        return;
      }
      if (!data.is_public) {
        const user = await getAuthenticatedUser(client, req);
        if (!user || user.id !== data.user_id) {
          sendJson(res, 404, { error: "Project not found." });
          return;
        }
      }
      sendJson(res, 200, { project: data });
      return;
    }

    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to change this project." });
      return;
    }

    if (req.method === "DELETE") {
      const { data, error } = await client
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id, asset_path")
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        sendJson(res, 404, { error: "Project not found." });
        return;
      }
      if (data.asset_path) {
        const { error: storageError } = await client.storage
          .from("project-files")
          .remove([data.asset_path]);
        if (storageError) {
          throw storageError;
        }
      }
      res.status(204).end();
      return;
    }

    const body = readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: "A JSON object is required." });
      return;
    }
    const validation = validateUpdates(body);
    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    const { data, error } = await client
      .from("projects")
      .update(validation.updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, user_id, title, author, scratch_project_id, asset_path, description, category, tags, is_public, created_at, updated_at")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      sendJson(res, 404, { error: "Project not found." });
      return;
    }
    sendJson(res, 200, { project: data });
  } catch (error) {
    logApiError("Unable to process project request.", error);
    sendJson(res, 500, { error: "Unable to process the project request." });
  }
}
