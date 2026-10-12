import { apiRequest } from "./api.js";

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

export async function loadPublicProfile(userId) {
  return apiRequest(`/api/profiles/${encodeURIComponent(userId)}`);
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