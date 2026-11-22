import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";

const DEFAULT_GUEST_MISSIONS = [
  {
    key: "daily_checkin",
    title: "Điểm danh hàng ngày",
    titleEn: "Daily Check-in",
    description: "Đăng nhập và nhận Kat Coin mỗi ngày.",
    type: "daily",
    reward: 100,
    progress: 0,
    target: 1,
    completed: false,
    claimed: false
  },
  {
    key: "daily_like",
    title: "Thả tim dự án",
    titleEn: "Spread the Love",
    description: "Thả tim cho 2 dự án bạn yêu thích hôm nay.",
    type: "daily",
    reward: 40,
    progress: 0,
    target: 2,
    completed: false,
    claimed: false
  },
  {
    key: "daily_chat",
    title: "Giao lưu cộng đồng",
    titleEn: "Community Chatter",
    description: "Gửi ít nhất 2 tin nhắn trong phòng Chat hôm nay.",
    type: "daily",
    reward: 30,
    progress: 0,
    target: 2,
    completed: false,
    claimed: false
  },
  {
    key: "daily_fav",
    title: "Bộ sưu tập yêu thích",
    titleEn: "Favorite a Project",
    description: "Lưu 1 dự án xuất sắc vào danh sách yêu thích hôm nay.",
    type: "daily",
    reward: 30,
    progress: 0,
    target: 1,
    completed: false,
    claimed: false
  },
  {
    key: "daily_publish",
    title: "Nhà sáng tạo chăm chỉ",
    titleEn: "Publish a Project",
    description: "Đăng tải 1 dự án mới hôm nay lên Aftercode.",
    type: "daily",
    reward: 150,
    progress: 0,
    target: 1,
    completed: false,
    claimed: false
  },
  {
    key: "milestone_profile",
    title: "Hoàn thiện hồ sơ",
    titleEn: "Profile Pioneer",
    description: "Cập nhật ảnh đại diện và tiểu sử cá nhân.",
    type: "milestone",
    reward: 80,
    progress: 0,
    target: 1,
    completed: false,
    claimed: false
  }
];

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
      let missions = DEFAULT_GUEST_MISSIONS;

      if (user) {
        const [{ data: missionData, error: missionError }, ownedResult, walletResult] = await Promise.all([
          client.rpc("get_kat_coin_missions_status", { p_user_id: user.id }),
          client.from("user_profile_decorations").select("decoration_id").eq("user_id", user.id),
          client.from("profile_decoration_wallets").select("daily_claimed_at").eq("user_id", user.id).maybeSingle()
        ]);

        if (missionError) throw missionError;
        if (ownedResult.error) throw ownedResult.error;

        balance = missionData?.balance ?? 0;
        missions = missionData?.missions ?? DEFAULT_GUEST_MISSIONS;
        dailyClaimedAt = walletResult.data?.daily_claimed_at ?? null;
        ownedIds = (ownedResult.data ?? []).map((item) => item.decoration_id);
      }

      res.setHeader("Cache-Control", user ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300");
      sendJson(res, 200, {
        decorations: (items ?? []).map((item) => toDecoration(client, item)),
        balance,
        missions,
        dailyClaimedAt,
        ownedIds
      });
      return;
    }

    if (!user) {
      sendJson(res, 401, { error: "Đăng nhập để sử dụng Shop Kat Coin." });
      return;
    }

    const body = readJsonBody(req);
    if (!body || typeof body.action !== "string") {
      sendJson(res, 400, { error: "Hành động không hợp lệ." });
      return;
    }

    if (body.action === "purchase") {
      const decorationId = typeof body.decorationId === "string" ? body.decorationId : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decorationId)) {
        sendJson(res, 400, { error: "Vật phẩm không hợp lệ." });
        return;
      }
      const { data, error } = await client.rpc("purchase_profile_decoration", {
        p_user_id: user.id,
        p_decoration_id: decorationId
      });
      if (error) {
        if (error.message.includes("ALREADY_OWNED")) {
          const { data: wallet, error: walletError } = await client.from("profile_decoration_wallets")
            .select("balance")
            .eq("user_id", user.id)
            .maybeSingle();
          if (walletError) throw walletError;
          sendJson(res, 409, {
            error: "Bạn đã sở hữu khung trang trí này rồi.",
            code: "DECORATION_ALREADY_OWNED",
            balance: wallet?.balance ?? null
          });
          return;
        }
        const message = error.message.includes("INSUFFICIENT_CREDITS")
          ? "Bạn không đủ Kat Coin để mua vật phẩm này."
          : error.message.includes("NOT_AVAILABLE")
              ? "Vật phẩm này hiện không còn mở bán."
              : null;
        if (message) {
          sendJson(res, 409, { error: message });
          return;
        }
        throw error;
      }

      // Record transaction ledger
      await client.from("kat_coin_ledger").insert({
        user_id: user.id,
        amount: 0, // already deducted atomically in purchase_profile_decoration
        balance_after: data.balance,
        reason: `shop_purchase:${decorationId}`
      }).catch(() => {});

      sendJson(res, 200, { balance: data.balance });
      return;
    }

    if (body.action === "claim_mission" || body.action === "claim_daily") {
      const missionKey = body.action === "claim_daily"
        ? "daily_checkin"
        : (typeof body.missionKey === "string" ? body.missionKey.trim() : "");

      if (!/^[a-z0-9_]{1,64}$/.test(missionKey)) {
        sendJson(res, 400, { error: "Nhiệm vụ không hợp lệ." });
        return;
      }

      const { data, error } = await client.rpc("claim_kat_coin_mission", {
        p_user_id: user.id,
        p_mission_key: missionKey
      });

      if (error) {
        if (error.message.includes("MISSION_ALREADY_CLAIMED") || error.message.includes("DAILY_CREDITS_ALREADY_CLAIMED")) {
          sendJson(res, 409, {
            error: "Nhiệm vụ này đã được nhận thưởng hôm nay. Vui lòng quay lại sau.",
            code: "MISSION_ALREADY_CLAIMED"
          });
          return;
        }
        if (error.message.includes("MISSION_NOT_COMPLETED")) {
          sendJson(res, 409, {
            error: "Bạn chưa hoàn thành mục tiêu của nhiệm vụ này.",
            code: "MISSION_NOT_COMPLETED"
          });
          return;
        }
        if (error.message.includes("INVALID_MISSION_KEY")) {
          sendJson(res, 400, { error: "Nhiệm vụ không tồn tại." });
          return;
        }
        throw error;
      }

      sendJson(res, 200, {
        success: true,
        balance: data.balance,
        reward: data.reward,
        missionKey: data.missionKey
      });
      return;
    }

    sendJson(res, 400, { error: "Hành động không hợp lệ." });
  } catch (error) {
    logApiError("Unable to process decoration shop request.", error);
    sendJson(res, 500, { error: "Không thể xử lý yêu cầu cửa hàng Kat Coin lúc này." });
  }
}
