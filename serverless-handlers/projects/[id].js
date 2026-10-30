import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";
import { isAdminUserId } from "../../shared/adminUsers.js";

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
const SCRATCH_PROJECT_ID = /^\d{1,20}$/;

function isUserStoragePath(path, userId) {
  return typeof path === "string"
    && path.startsWith(`${userId}/`)
    && !path.includes("..")
    && !path.includes("\\");
}

function validateUpdates(body, userId) {
  const updates = {};

  if (Object.hasOwn(body, "scratchProjectId") && Object.hasOwn(body, "assetPath")) {
    return { error: "Provide either a Scratch project ID or an uploaded .sb3 file path, not both." };
  }

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
    updates.asset_path = null;
  }
  if (Object.hasOwn(body, "assetPath")) {
    const assetPath = typeof body.assetPath === "string" ? body.assetPath.trim() : "";
    if (!assetPath.endsWith(".sb3") || assetPath.includes("..") || assetPath.includes("\\")
      || !assetPath.startsWith(`${userId}/`)) {
      return { error: "Upload a valid .sb3 file to your own project-files folder." };
    }
    updates.asset_path = assetPath;
    updates.scratch_project_id = null;
  }
  if (Object.hasOwn(body, "thumbnailPath")) {
    if (body.thumbnailPath === null || body.thumbnailPath === "") {
      updates.thumbnail_url = null;
    } else {
      const thumbnailPath = typeof body.thumbnailPath === "string" ? body.thumbnailPath.trim() : "";
      if (!thumbnailPath.startsWith(`${userId}/project-thumbnails/`)
        || thumbnailPath.includes("..")
        || thumbnailPath.includes("\\")
        || !/\.(png|jpe?g|webp|gif)$/i.test(thumbnailPath)) {
        return { error: "Upload a PNG, JPEG, WebP, or GIF thumbnail to your project-thumbnails folder." };
      }
      updates.thumbnail_url = thumbnailPath;
    }
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
        .select("id, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, is_featured, created_at, updated_at")
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
      const [profileResult, likesResult] = await Promise.all([
        client.from("profiles").select("avatar_url").eq("user_id", data.user_id).maybeSingle(),
        client.from("project_likes").select("project_id", { count: "exact", head: true }).eq("project_id", id)
      ]);
      if (profileResult.error) throw profileResult.error;
      if (likesResult.error) throw likesResult.error;
      sendJson(res, 200, {
        project: {
          ...data,
          authorAvatar: profileResult.data?.avatar_url || "",
          likes: likesResult.count ?? 0
        }
      });
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
        .select("id, user_id, asset_path, thumbnail_url")
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        sendJson(res, 404, { error: "Project not found." });
        return;
      }
      const pathsToRemove = [data.asset_path].filter(Boolean);
      if (isUserStoragePath(data.thumbnail_url, data.user_id)) {
        pathsToRemove.push(data.thumbnail_url);
      }
      if (pathsToRemove.length) {
        const { error: storageError } = await client.storage
          .from("project-files")
          .remove(pathsToRemove);
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
    if (Object.hasOwn(body, "isFeatured")) {
      if (!isAdminUserId(user.id)) {
        sendJson(res, 403, { error: "Only project administrators can feature projects." });
        return;
      }
      if (Object.keys(body).length !== 1 || typeof body.isFeatured !== "boolean") {
        sendJson(res, 400, { error: "Provide only a boolean isFeatured value." });
        return;
      }
      const { data, error } = await client
        .from("projects")
        .update({ is_featured: body.isFeatured, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, is_featured, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        sendJson(res, 404, { error: "Project not found." });
        return;
      }
      sendJson(res, 200, { project: data });
      return;
    }
    const validation = validateUpdates(body, user.id);
    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    const { data: previous, error: previousError } = await client
      .from("projects")
      .select("asset_path, thumbnail_url")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (previousError) throw previousError;
    if (!previous) {
      sendJson(res, 404, { error: "Project not found." });
      return;
    }

    const { data, error } = await client
      .from("projects")
      .update(validation.updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, is_featured, created_at, updated_at")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      sendJson(res, 404, { error: "Project not found." });
      return;
    }
    if (previous.asset_path && previous.asset_path !== data.asset_path) {
      const { error: cleanupError } = await client.storage
        .from("project-files")
        .remove([previous.asset_path]);
      if (cleanupError) logApiError("Unable to clean up replaced project file.", cleanupError);
    }
    if (previous.thumbnail_url
      && previous.thumbnail_url !== data.thumbnail_url
      && isUserStoragePath(previous.thumbnail_url, user.id)) {
      const { error: cleanupError } = await client.storage
        .from("project-files")
        .remove([previous.thumbnail_url]);
      if (cleanupError) logApiError("Unable to clean up replaced project thumbnail.", cleanupError);
    }
    sendJson(res, 200, { project: data });
  } catch (error) {
    logApiError("Unable to process project request.", error);
    sendJson(res, 500, { error: "Unable to process the project request." });
  }
}
