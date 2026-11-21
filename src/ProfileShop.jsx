import { useState } from "react";
import { apiRequest } from "./api.js";
import "./ProfileShop.css";

const DAILY_CREDIT_INTERVAL = 24 * 60 * 60 * 1000;

export default function ProfileShop({ user, shopData, equippedFrame, onRefreshShop, onEquipFrame, onSignIn }) {
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dailyAvailable = !shopData.dailyClaimedAt
    || Date.now() - new Date(shopData.dailyClaimedAt).getTime() >= DAILY_CREDIT_INTERVAL;
  const availableDecorations = shopData.decorations.filter((item) => item.isActive);

  const claimDailyCredits = async () => {
    setBusyAction("daily");
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/shop", {
        method: "POST",
        authenticated: true,
        body: { action: "claim_daily" }
      });
      await onRefreshShop();
      setMessage("100 daily credits added to your balance.");
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
      setMessage(`${item.name} added to your collection.`);
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
      if (!saved) throw new Error("Unable to equip this frame. Please try again.");
      await onRefreshShop();
      setMessage(`${item.name} is now on your profile.`);
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
          <span className="profile-shop-eyebrow">AFTERCODE DECORATIONS</span>
          <h1>Profile Decoration Shop</h1>
          <p>Collect avatar frames for your profile. Credits are virtual and have no cash value.</p>
        </div>
        {user ? (
          <div className="profile-shop-wallet">
            <span>YOUR CREDITS</span>
            <strong>{Number.isFinite(shopData.balance) ? shopData.balance.toLocaleString() : "..."}</strong>
            <button type="button" disabled={busyAction === "daily" || !dailyAvailable} onClick={claimDailyCredits}>
              {busyAction === "daily" ? "Claiming..." : dailyAvailable ? "Claim 100 daily credits" : "Daily credits claimed"}
            </button>
          </div>
        ) : (
          <button className="profile-shop-signin" type="button" onClick={onSignIn}>Sign in to shop</button>
        )}
      </header>

      {(error || shopData.error) && <p className="profile-shop-error" role="alert">{error || shopData.error}</p>}
      {message && <p className="profile-shop-message" role="status">{message}</p>}

      {shopData.loading ? (
        <p className="profile-shop-empty" role="status">Loading the decoration shop...</p>
      ) : availableDecorations.length ? (
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
                  <span className="profile-shop-item-author">by {item.author}</span>
                  <p>{item.description || "A profile avatar frame from the Aftercode community."}</p>
                </div>
                <div className="profile-shop-item-footer">
                  <strong>{item.price.toLocaleString()} credits</strong>
                  {!user ? (
                    <button type="button" onClick={onSignIn}>Sign in to buy</button>
                  ) : owned ? (
                    <button type="button" disabled={busyAction === item.id || equipped} onClick={() => equipDecoration(item)}>
                      {busyAction === item.id ? "Equipping..." : equipped ? "Equipped" : "Equip"}
                    </button>
                  ) : (
                    <button type="button" disabled={busyAction === item.id} onClick={() => purchaseDecoration(item)}>
                      {busyAction === item.id ? "Buying..." : "Buy"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="profile-shop-empty" role="status">No profile decorations are in the shop yet.</p>
      )}
    </section>
  );
}
