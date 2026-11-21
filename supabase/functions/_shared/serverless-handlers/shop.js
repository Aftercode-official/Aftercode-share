import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

function toDecoration(client, item) {
  return {
    id: item.id,
    name: item.name,
    author: item.author,
    description: item.description,
    price: item.price,
    isActive: item.is_active,
    imageUrl: client.storage.from("project-files").getPublicUrl(item.image_path).data.publicUrl,
    createdAt: item.created_at
  };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);

    if (req.method === "GET") {
      const { data: items, error: itemsError } = await client
        .from("profile_decorations")
        .select("id, name, author, description, image_path, price, is_active, created_at")
        .order("price", { ascending: true })
        .limit(100);
      if (itemsError) throw itemsError;

      let balance = null;
      let dailyClaimedAt = null;
      let ownedIds = [];
      if (user) {
        const { error: walletError } = await client.rpc("ensure_profile_decoration_wallet", { p_user_id: user.id });
        if (walletError) throw walletError;
        const [walletResult, ownedResult] = await Promise.all([
          client.from("profile_decoration_wallets").select("balance, daily_claimed_at").eq("user_id", user.id).single(),
          client.from("user_profile_decorations").select("decoration_id").eq("user_id", user.id)
        ]);
        if (walletResult.error) throw walletResult.error;
        if (ownedResult.error) throw ownedResult.error;
        balance = walletResult.data.balance;
        dailyClaimedAt = walletResult.data.daily_claimed_at;
        ownedIds = (ownedResult.data ?? []).map((item) => item.decoration_id);
      }

      res.setHeader("Cache-Control", user ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300");
      sendJson(res, 200, {
        decorations: (items ?? []).map((item) => toDecoration(client, item)),
        balance,
        dailyClaimedAt,
        ownedIds
      });
      return;
    }

    if (!user) {
      sendJson(res, 401, { error: "Sign in to use the decoration shop." });
      return;
    }

    const body = readJsonBody(req);
    if (!body || typeof body.action !== "string") {
      sendJson(res, 400, { error: "Choose a valid shop action." });
      return;
    }

    if (body.action === "purchase") {
      const decorationId = typeof body.decorationId === "string" ? body.decorationId : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decorationId)) {
        sendJson(res, 400, { error: "Choose a valid decoration." });
        return;
      }
      const { data, error } = await client.rpc("purchase_profile_decoration", {
        p_user_id: user.id,
        p_decoration_id: decorationId
      });
      if (error) {
        const message = error.message.includes("INSUFFICIENT_CREDITS")
          ? "You do not have enough credits for this decoration."
          : error.message.includes("ALREADY_OWNED")
            ? "You already own this decoration."
            : error.message.includes("NOT_AVAILABLE")
              ? "This decoration is no longer available."
              : null;
        if (message) {
          sendJson(res, 409, { error: message });
          return;
        }
        throw error;
      }
      sendJson(res, 200, { balance: data.balance });
      return;
    }

    if (body.action === "claim_daily") {
      const { data, error } = await client.rpc("claim_profile_decoration_daily_credits", { p_user_id: user.id });
      if (error) {
        if (error.message.includes("DAILY_CREDITS_ALREADY_CLAIMED")) {
          sendJson(res, 409, { error: "Your daily credits have already been claimed. Come back in 24 hours." });
          return;
        }
        throw error;
      }
      sendJson(res, 200, data);
      return;
    }

    sendJson(res, 400, { error: "Unknown shop action." });
  } catch (error) {
    logApiError("Unable to process decoration shop request.", error);
    sendJson(res, 500, { error: "Unable to process the decoration shop request." });
  }
}
