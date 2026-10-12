import { logApiError, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) {
    return;
  }

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "A valid bearer token is required." });
      return;
    }

    sendJson(res, 200, {
      id: user.id,
      email: user.email,
      metadata: user.user_metadata
    });
  } catch (error) {
    logApiError("Unable to verify the current user.", error);
    sendJson(res, 500, { error: "Unable to verify the current user." });
  }
}
