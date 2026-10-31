import { apiRequest } from "./api.js";

const PUBLIC_PROFILE_CACHE_KEY = "aftercode-share-last-public-profile-v1";
const PROFILE_STATS_CACHE_KEY = "aftercode-share-profile-stats-v1";

export function getCachedProfileStats(userId) {
  if (!userId) return null;
  try {
    const cache = JSON.parse(window.localStorage.getItem(PROFILE_STATS_CACHE_KEY) || "null");
    return cache?.[userId]?.stats ?? null;
  } catch {
    return null;
  }
}

export function cacheProfileStats(userId, stats) {
  if (!userId || !stats || typeof stats !== "object") return;
  try {
    const cache = JSON.parse(window.localStorage.getItem(PROFILE_STATS_CACHE_KEY) || "{}") || {};
    const entries = Object.entries(cache)
      .filter(([, entry]) => Date.now() - (entry.updatedAt ?? 0) < 90 * 24 * 60 * 60 * 1000)
      .sort(([, first], [, second]) => first.updatedAt - second.updatedAt);
    const next = Object.fromEntries(entries);
    const previousStats = next[userId]?.stats ?? {};
    delete next[userId];
    next[userId] = {
      stats: { ...previousStats, ...stats },
      updatedAt: Date.now()
    };
    const limited = Object.fromEntries(Object.entries(next).slice(-100));
    window.localStorage.setItem(PROFILE_STATS_CACHE_KEY, JSON.stringify(limited));
  } catch {
    // Profile counters can still load from the API when browser storage is unavailable.
  }
}

export function getCachedPublicProfile(userId) {
  if (!userId) return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(PUBLIC_PROFILE_CACHE_KEY) || "null");
    return cached?.userId === userId && cached.data?.profile ? cached.data : null;
  } catch {
    return null;
  }
}

export function getCachedPublicProfileByUsername(username) {
  const normalized = String(username || "").trim().replace(/^@/, "").toLocaleLowerCase();
  if (!normalized) return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(PUBLIC_PROFILE_CACHE_KEY) || "null");
    return cached?.data?.profile?.username?.replace(/^@/, "").toLocaleLowerCase() === normalized
      ? cached
      : null;
  } catch {
    return null;
  }
}

export function cachePublicProfile(userId, data) {
  if (!userId || !data?.profile) return;
  try {
    window.localStorage.setItem(PUBLIC_PROFILE_CACHE_KEY, JSON.stringify({ userId, data }));
    cacheProfileStats(userId, {
      followersCount: data.followersCount ?? 0,
      followingCount: data.followingCount ?? 0,
      favoritesCount: data.favoritesCount ?? data.favoriteProjects?.length ?? 0
    });
  } catch {
    // Profile cache is optional when browser storage is full or unavailable.
  }
}

function toClientShape(record) {
  return {
    displayName: record.display_name ?? "",
    username: record.username ? `@${record.username.replace(/^@/, "")}` : "",
    bio: record.bio ?? "",
    avatarUrl: record.avatar_url ?? "",
    bannerUrl: record.banner_url ?? "",
    accentColor: record.accent_color ?? "#ffb700",
    homeBackground: record.home_background ?? "#fffdfa",
    profileBackground: record.profile_background ?? "#171513",
    showWelcome: record.show_welcome ?? true,
    showFeed: record.show_feed ?? true,
    showFeatured: record.show_featured ?? true,
    showProfileBio: record.show_profile_bio ?? true,
    showProfileProjects: record.show_profile_projects ?? true,
    showProfileStats: record.show_profile_stats ?? true
  };
}

function toServerShape(customization) {
  return {
    displayName: customization.displayName,
    username: (customization.username ?? "").replace(/^@/, ""),
    bio: customization.bio,
    avatarUrl: customization.avatarUrl,
    bannerUrl: customization.bannerUrl,
    accentColor: customization.accentColor,
    homeBackground: customization.homeBackground,
    profileBackground: customization.profileBackground,
    showWelcome: customization.showWelcome,
    showFeed: customization.showFeed,
    showFeatured: customization.showFeatured,
    showProfileBio: customization.showProfileBio,
    showProfileProjects: customization.showProfileProjects,
    showProfileStats: customization.showProfileStats
  };
}

export async function loadCustomization() {
  try {
    const { profile } = await apiRequest("/api/profiles/me", { authenticated: true });
    return toClientShape(profile);
  } catch {
    return null;
  }
}

export async function saveCustomization(customization) {
  const { profile } = await apiRequest("/api/profiles/me", {
    method: "PUT",
    authenticated: true,
    body: toServerShape(customization)
  });
  return toClientShape(profile);
}

export async function loadPublicProfile(userId, { authenticated = false } = {}) {
  const data = await apiRequest(`/api/profiles/${encodeURIComponent(userId)}`, { authenticated });
  cachePublicProfile(userId, data);
  return data;
}

export async function loadFollowState(userId) {
  return apiRequest(`/api/follows?userId=${encodeURIComponent(userId)}`, { authenticated: true });
}

export async function apiFollow(userId, enabled) {
  return apiRequest("/api/follows", {
    method: "POST",
    authenticated: true,
    body: { userId, enabled }
  });
}

export async function loadFollowList(userId, list) {
  return apiRequest(
    `/api/follows?userId=${encodeURIComponent(userId)}&list=${encodeURIComponent(list)}`
  );
}
