import { useState } from "react";
import { apiRequest } from "./api.js";
import "./ProfileShop.css";

const MISSION_ICONS = {
  daily_checkin: "🎁",
  daily_like: "❤️",
  daily_chat: "💬",
  daily_fav: "⭐",
  daily_publish: "🚀",
  milestone_profile: "👤"
};

export default function ProfileShop({ user, shopData, equippedFrame, onRefreshShop, onEquipFrame, onSignIn }) {
  const [activeTab, setActiveTab] = useState("frames"); // 'frames' | 'missions'
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const availableDecorations = shopData.decorations.filter((item) => item.isActive);
  const missions = shopData.missions ?? [];

  const completedUnclaimedCount = user
    ? missions.filter((m) => m.completed && !m.claimed).length
    : 0;

  const claimMission = async (mission) => {
    if (!user) {
      onSignIn();
      return;
    }
    setBusyAction(mission.key);
    setError("");
    setMessage("");
    try {
      const response = await apiRequest("/api/shop", {
        method: "POST",
        authenticated: true,
        body: { action: "claim_mission", missionKey: mission.key }
      });
      await onRefreshShop();
      setMessage(`🎉 Chúc mừng! Bạn đã nhận thành công +${response?.reward ?? mission.reward} Kat Coin!`);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyAction("");
    }
  };

  const purchaseDecoration = async (item) => {
    setBusyAction(item.id);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/shop", {
        method: "POST",
        authenticated: true,
        body: { action: "purchase", decorationId: item.id }
      });
      await onRefreshShop();
      setMessage(`Đã mua thành công khung ${item.name}! Hãy trang bị ngay cho hồ sơ.`);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyAction("");
    }
  };

  const equipDecoration = async (item) => {
    setBusyAction(item.id);
    setError("");
    setMessage("");
    try {
      const saved = await onEquipFrame(item.id);
      if (!saved) throw new Error("Không thể trang bị khung lúc này. Vui lòng thử lại.");
      await onRefreshShop();
      setMessage(`Đã trang bị ${item.name} cho ảnh đại diện.`);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyAction("");
    }
  };

  return (
    <section className="profile-shop">
      <header className="profile-shop-heading">
        <div>
          <span className="profile-shop-eyebrow">AFTERCODE KAT COIN & SHOP</span>
          <h1>Cửa hàng & Nhiệm vụ Kat Coin</h1>
          <p>Thu thập Kat Coin qua nhiệm vụ hàng ngày để sở hữu các khung avatar độc quyền.</p>
        </div>
        {user ? (
          <div className="profile-shop-wallet">
            <span>SỐ DƯ KAT COIN</span>
            <strong>🪙 {Number.isFinite(shopData.balance) ? shopData.balance.toLocaleString() : "..."} KC</strong>
            <button
              type="button"
              className="profile-shop-wallet-missions-btn"
              onClick={() => setActiveTab("missions")}
            >
              {completedUnclaimedCount > 0 ? `🎯 Nhận thưởng (${completedUnclaimedCount})` : "🎯 Danh sách nhiệm vụ"}
            </button>
          </div>
        ) : (
          <button className="profile-shop-signin" type="button" onClick={onSignIn}>
            Đăng nhập để nhận Kat Coin
          </button>
        )}
      </header>

      {/* Navigation tabs */}
      <nav className="profile-shop-tabs" aria-label="Shop tabs">
        <button
          type="button"
          className={`profile-shop-tab${activeTab === "frames" ? " is-active" : ""}`}
          onClick={() => { setActiveTab("frames"); setError(""); setMessage(""); }}
        >
          🎨 Khung Avatar ({availableDecorations.length})
        </button>
        <button
          type="button"
          className={`profile-shop-tab${activeTab === "missions" ? " is-active" : ""}`}
          onClick={() => { setActiveTab("missions"); setError(""); setMessage(""); }}
        >
          🎯 Nhiệm vụ Kat Coin {completedUnclaimedCount > 0 && <span className="profile-shop-tab-badge">{completedUnclaimedCount}</span>}
        </button>
      </nav>

      {(error || shopData.error) && <p className="profile-shop-error" role="alert">{error || shopData.error}</p>}
      {message && <p className="profile-shop-message" role="status">{message}</p>}

      {shopData.loading ? (
        <p className="profile-shop-empty" role="status">Đang tải cửa hàng và nhiệm vụ...</p>
      ) : activeTab === "frames" ? (
        /* TAB 1: AVATAR FRAMES SHOP */
        availableDecorations.length ? (
          <div className="profile-shop-grid">
            {availableDecorations.map((item) => {
              const owned = shopData.ownedIds?.includes(item.id);
              const equipped = user && item.id === equippedFrame;
              return (
                <article className="profile-shop-item" key={item.id}>
                  <div className="profile-shop-item-art">
                    <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                  </div>
                  <div className="profile-shop-item-copy">
                    <h2>{item.name}</h2>
                    <span className="profile-shop-item-author">bởi {item.author}</span>
                    <p>{item.description || "Khung trang trí ảnh đại diện từ Aftercode."}</p>
                  </div>
                  <div className="profile-shop-item-footer">
                    <strong>🪙 {item.price.toLocaleString()} KC</strong>
                    {!user ? (
                      <button type="button" onClick={onSignIn}>Đăng nhập để mua</button>
                    ) : owned ? (
                      <button type="button" disabled={busyAction === item.id || equipped} onClick={() => equipDecoration(item)}>
                        {busyAction === item.id ? "Đang gán..." : equipped ? "Đang đeo" : "Trang bị"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyAction === item.id || (Number.isFinite(shopData.balance) && shopData.balance < item.price)}
                        onClick={() => purchaseDecoration(item)}
                      >
                        {busyAction === item.id ? "Đang mua..." : Number.isFinite(shopData.balance) && shopData.balance < item.price ? "Chưa đủ KC" : "Mua khung"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="profile-shop-empty" role="status">Hiện tại chưa có khung trang trí nào được mở bán.</p>
        )
      ) : (
        /* TAB 2: KAT COIN MISSIONS & ANTI-HACK INFO */
        <div className="profile-shop-missions-container">
          <div className="profile-shop-missions-header">
            <div>
              <h2>Nhiệm vụ kiếm Kat Coin</h2>
              <p>Hoàn thành hành động mỗi ngày để nhận Kat Coin thưởng. Nhiệm vụ hàng ngày sẽ được làm mới lúc 00:00 UTC.</p>
            </div>
            {completedUnclaimedCount > 0 && (
              <span className="profile-shop-missions-ready-pill">
                Có {completedUnclaimedCount} nhiệm vụ sẵn sàng nhận thưởng!
              </span>
            )}
          </div>

          <div className="profile-shop-missions-list">
            {missions.map((mission) => {
              const isClaimed = mission.claimed;
              const isCompleted = mission.completed;
              const isBusy = busyAction === mission.key;
              const progressPct = Math.min(100, Math.round((mission.progress / mission.target) * 100));
              const icon = MISSION_ICONS[mission.key] || "⭐";

              return (
                <div
                  key={mission.key}
                  className={`profile-shop-mission-card${isClaimed ? " is-claimed" : isCompleted ? " is-ready" : ""}`}
                >
                  <div className="profile-shop-mission-icon" aria-hidden="true">
                    {icon}
                  </div>
                  <div className="profile-shop-mission-info">
                    <div className="profile-shop-mission-title-row">
                      <h3>{mission.title}</h3>
                      <span className={`profile-shop-mission-tag tag-${mission.type}`}>
                        {mission.type === "daily" ? "Hàng ngày" : "Thành tựu"}
                      </span>
                    </div>
                    <p>{mission.description}</p>
                    <div className="profile-shop-mission-progress-bar-wrap">
                      <div className="profile-shop-mission-progress-bar" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="profile-shop-mission-progress-text">
                      Tiến độ: <strong>{mission.progress}</strong> / {mission.target}
                    </span>
                  </div>

                  <div className="profile-shop-mission-reward-side">
                    <span className="profile-shop-mission-reward-badge">+{mission.reward} 🪙</span>
                    {!user ? (
                      <button type="button" className="profile-shop-mission-btn" onClick={onSignIn}>
                        Đăng nhập
                      </button>
                    ) : isClaimed ? (
                      <button type="button" className="profile-shop-mission-btn is-claimed" disabled>
                        ✓ Đã nhận
                      </button>
                    ) : isCompleted ? (
                      <button
                        type="button"
                        className="profile-shop-mission-btn is-claim-ready"
                        disabled={isBusy}
                        onClick={() => claimMission(mission)}
                      >
                        {isBusy ? "Đang nhận..." : "Nhận thưởng"}
                      </button>
                    ) : (
                      <button type="button" className="profile-shop-mission-btn" disabled>
                        Chưa xong
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Anti-cheat & Anti-spam Security Card */}
          <div className="profile-shop-security-box">
            <div className="profile-shop-security-badge">🛡️ BẢO VỆ CHỐNG SPAM & HACK</div>
            <h4>Hệ thống bảo vệ giao dịch & nhiệm vụ Kat Coin</h4>
            <ul>
              <li><strong>Xác thực Server-side:</strong> Mọi nhiệm vụ đều được máy chủ kiểm tra trực tiếp từ lịch sử tương tác thật (tim, chat, đăng bài) trong cơ sở dữ liệu. Không thể hack tiến độ từ client.</li>
              <li><strong>Khóa giao dịch nguyên tử (Row Locking):</strong> Mỗi nhiệm vụ chỉ được ghi nhận một lần duy nhất qua cơ chế khóa phân tán, ngăn chặn triệt để hành vi gửi lặp request (race conditions).</li>
              <li><strong>Sổ cái giao dịch (Audit Ledger):</strong> Mọi biến động số dư Kat Coin đều được lưu vết chi tiết với mã định danh người dùng và thời gian thực.</li>
              <li><strong>Chống Spam:</strong> Tần suất thao tác nhận thưởng được giới hạn nghiêm ngặt qua lớp Rate Limiter.</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
