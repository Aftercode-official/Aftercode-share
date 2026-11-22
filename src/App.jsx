import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
const User = lazy(() => import("./User.jsx"));
const ProjectPages = lazy(() => import("./ProjectPages.jsx"));
import { getCachedPublicProfileByUsername, loadCustomization, saveCustomization as persistCustomization } from "./userStorage.js";
import { supabase } from "./supabase.js";
import { apiRequest } from "./api.js";
const AuthModal = lazy(() => import("./AuthModal.jsx"));
const UploadProjectModal = lazy(() => import("./UploadProjectModal.jsx"));
import LogoIcon from "./assets/Logo.png";
import BearAvatarFrame from "./assets/bear-avatar-frame.png";
import ProjectThumbnail from "./ProjectThumbnail.jsx";
const ChatCenter = lazy(() => import("./ChatCenter.jsx"));
const AdminPanel = lazy(() => import("./AdminPanel.jsx"));
const NotificationsPage = lazy(() => import("./NotificationsPage.jsx"));
const ProfileShop = lazy(() => import("./ProfileShop.jsx"));
import { getProjectIdFromUrl, projectShareUrl } from "./projectLinks.js";
import "./App.css";
import { isAdminUserId } from "../shared/adminUsers.js";
import LoadingScreen from "./LoadingScreen.jsx";
import "./BrutalistTheme.css";
import "./ClassicTheme.css";

const THEME_STORAGE_KEY = "aftercode-share-theme";
const SITE_STYLE_STORAGE_KEY = "aftercode-share-site-style";
const COMPATIBILITY_MODE_STORAGE_KEY = "aftercode-share-compatibility-mode";
const CUSTOMIZATION_STORAGE_KEY = "aftercode-share-customization";
const PUBLIC_DATA_CACHE_KEY = "aftercode-share-public-data-v1";
const APP_BASE_PATH = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/$/, "");
const DEFAULT_CUSTOMIZATION = {
  displayName: "Name",
  username: "@IDName",
  bio: "Sharing the projects I love.",
  avatarUrl: "",
  avatarFrame: "none",
  bannerUrl: "",
  accentColor: "#ffb700",
  homeBackground: "#fffdfa",
  profileBackground: "#171513",
  showWelcome: true,
  showFeed: true,
  showFeatured: true,
  showProfileBio: true,
  showProfileProjects: true,
  showProfileStats: true
};

function appRoutePath(pathname) {
  const route = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!APP_BASE_PATH) return route;
  return route === "/" ? `${APP_BASE_PATH}/` : `${APP_BASE_PATH}${route}`;
}

function routePathFromLocation(pathname) {
  if (!APP_BASE_PATH) return pathname;
  if (pathname === APP_BASE_PATH || pathname === `${APP_BASE_PATH}/`) return "/";
  return pathname.startsWith(`${APP_BASE_PATH}/`) ? pathname.slice(APP_BASE_PATH.length) : pathname;
}

function toProject(record) {
  const projectUrl = record.asset_path
    ? supabase.storage.from("project-files").getPublicUrl(record.asset_path).data.publicUrl
    : (record.scratch_project_id
      ? `https://projects.scratch.mit.edu/${record.scratch_project_id}`
      : null);
  const thumb = record.thumbnail_url
    ? (record.thumbnail_url.startsWith("http")
      ? record.thumbnail_url
      : supabase.storage.from("project-files").getPublicUrl(record.thumbnail_url).data.publicUrl)
    : (record.scratch_project_id
      ? `https://uploads.scratch.mit.edu/get_image/project/${record.scratch_project_id}_480x360.png`
      : null);
  return {
    id: record.id,
    databaseId: record.id,
    projectNumber: record.project_number ?? null,
    userId: record.user_id,
    scratchProjectId: record.scratch_project_id,
    assetPath: record.asset_path,
    thumbnailPath: record.thumbnail_url || "",
    projectUrl,
    title: record.title,
    author: record.author,
    authorAvatar: record.authorAvatar || "",
    thumb,
    isFeatured: record.is_featured === true,
    category: record.category,
    description: record.description,
    tags: record.tags,
    isPublic: record.is_public,
    views: record.view_count ?? record.views ?? 0,
    likes: record.likes
  };
}

function getInitialRoute() {
  const projectId = getProjectIdFromUrl(window.location.href);
  if (projectId) return { page: "project", username: "", peopleList: null };

  const parts = routePathFromLocation(window.location.pathname).split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (parts.length === 1 && parts[0] === "notification") {
    return { page: "notifications", username: "", peopleList: null };
  }
  if (parts.length === 1 && parts[0] === "chat") {
    return { page: "chat", username: "", peopleList: null };
  }
  if (parts.length === 1 && parts[0] === "shop") {
    return { page: "shop", username: "", peopleList: null };
  }
  if (parts.length === 1 && ["explorer", "explore"].includes(parts[0])) {
    return { page: "explore", username: "", peopleList: null };
  }
  if (parts[0] === "user" && parts[1]) {
    const peopleList = parts[2] === "follower" ? "followers" : parts[2] === "following" ? "following" : null;
    return { page: "user", username: parts[1], peopleList };
  }
  if (parts[0] && ["follower", "following"].includes(parts[1])) {
    return { page: "user", username: parts[0], peopleList: parts[1] === "follower" ? "followers" : "following" };
  }
  return { page: "home", username: "", peopleList: null };
}

function userPagePath(username, peopleList = null) {
  const slug = encodeURIComponent(String(username || "").trim().replace(/^@/, ""));
  if (!slug) return appRoutePath("/");
  if (peopleList === "followers") return appRoutePath(`/${slug}/follower`);
  if (peopleList === "following") return appRoutePath(`/${slug}/following`);
  return appRoutePath(`/user/${slug}`);
}

function readPublicDataCache() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(PUBLIC_DATA_CACHE_KEY) || "null");
    if (!cached || typeof cached !== "object") return null;
    return {
      projects: Array.isArray(cached.projects) ? cached.projects : [],
      announcements: Array.isArray(cached.announcements) ? cached.announcements : [],
      events: Array.isArray(cached.events) ? cached.events : []
    };
  } catch {
    return null;
  }
}

function writePublicDataCache(updates) {
  try {
    const cached = readPublicDataCache() ?? { projects: [], announcements: [], events: [] };
    window.localStorage.setItem(PUBLIC_DATA_CACHE_KEY, JSON.stringify({ ...cached, ...updates }));
  } catch {
    // The live API remains the source of truth if browser storage is unavailable.
  }
}

function normalizeCustomization(saved = {}) {
  const normalized = { ...DEFAULT_CUSTOMIZATION, ...saved };
  if (typeof saved.accentColor !== "string" || saved.accentColor.toLowerCase() === "#238a45") {
    normalized.accentColor = DEFAULT_CUSTOMIZATION.accentColor;
  }
  if (!["none", "gold", "neon", "pixel", "bear"].includes(normalized.avatarFrame)
    && !(typeof normalized.avatarFrame === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized.avatarFrame))) {
    normalized.avatarFrame = DEFAULT_CUSTOMIZATION.avatarFrame;
  }
  return normalized;
}

export default function App() {
  const initialRoute = getInitialRoute();
  const cachedRouteProfile = getCachedPublicProfileByUsername(initialRoute.username);
  const [initialPublicCache] = useState(readPublicDataCache);
  const [user, setUser] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(Boolean(supabase));
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);
  const hasCompletedInitialDataLoad = useRef(false);
  const viewRequestTimesRef = useRef(new Map());
  const [accountBanNotice, setAccountBanNotice] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState("sign-in");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppearanceMenuOpen, setIsAppearanceMenuOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const isLoggedIn = Boolean(user);
  const [projects, setProjects] = useState(() => (initialPublicCache?.projects ?? []).map(toProject));
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState(initialPublicCache?.announcements ?? []);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(!initialPublicCache);
  const [announcementError, setAnnouncementError] = useState("");
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState([]);
  const [events, setEvents] = useState(initialPublicCache?.events ?? []);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const unreadNotificationCount = notifications.filter((notification) => !notification.is_read).length;
  const [dataError, setDataError] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(!initialPublicCache);
  const [page, setPage] = useState(initialRoute.page);
  const [selectedProject, setSelectedProject] = useState(() => {
    const projectId = getProjectIdFromUrl(window.location.href);
    const cachedRecord = initialPublicCache?.projects.find((project) => (
      String(project.project_number ?? "") === projectId || String(project.id) === projectId
    ));
    return cachedRecord ? toProject(cachedRecord) : null;
  });
  const [selectedUserId, setSelectedUserId] = useState(cachedRouteProfile?.userId ?? null);
  const [profileRouteUsername, setProfileRouteUsername] = useState(initialRoute.username);
  const [peopleListRoute, setPeopleListRoute] = useState(initialRoute.peopleList);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectInteractions, setProjectInteractions] = useState({});
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "light" ? "light" : "dark";
  });
  const [siteStyle, setSiteStyle] = useState(() => (
    window.localStorage.getItem(SITE_STYLE_STORAGE_KEY) === "classic" ? "classic" : "brutalist"
  ));
  const [compatibilityMode, setCompatibilityMode] = useState(() => (
    window.localStorage.getItem(COMPATIBILITY_MODE_STORAGE_KEY) === "true"
  ));

  useEffect(() => {
    const handleAccountBanned = (event) => {
      setAccountBanNotice(event.detail?.message || "This account is permanently banned.");
    };
    window.addEventListener("aftercode:account-banned", handleAccountBanned);
    return () => window.removeEventListener("aftercode:account-banned", handleAccountBanned);
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen && !isAppearanceMenuOpen) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest(".header-profile-menu-wrap")) setIsProfileMenuOpen(false);
      if (!event.target.closest(".header-appearance-wrap")) setIsAppearanceMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
        setIsAppearanceMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProfileMenuOpen, isAppearanceMenuOpen]);
  const [customization, setCustomization] = useState(DEFAULT_CUSTOMIZATION);
  const [customizationError, setCustomizationError] = useState("");
  const [shopData, setShopData] = useState({ decorations: [], balance: null, missions: [], dailyClaimedAt: null, ownedIds: [], error: "", loading: true });
  const isProjectAdmin = isAdminUserId(user?.id);
  const featuredProjects = projects.filter((project) => project.isFeatured);
  const visibleAnnouncements = announcements.filter((item) => !dismissedAnnouncementIds.includes(String(item.id)));
  const equippedDecoration = shopData.decorations.find((item) => item.id === customization.avatarFrame);

  useEffect(() => {
    let active = true;
    setShopData((current) => ({ ...current, loading: true, error: "", balance: null, dailyClaimedAt: null, ownedIds: [] }));
    apiRequest("/api/shop", { authenticated: Boolean(user) })
      .then((result) => {
        if (active) setShopData({ ...result, error: "", loading: false });
      })
      .catch((error) => {
        if (active) setShopData((current) => ({ ...current, error: error.message, loading: false }));
      });
    return () => { active = false; };
  }, [user?.id]);

  const refreshShopData = async () => {
    const result = await apiRequest("/api/shop", { authenticated: Boolean(user), dedupe: false });
    setShopData({ ...result, error: "", loading: false });
    return result;
  };

  const loadProjects = async () => {
    const { projects: records } = await apiRequest("/api/projects");
    writePublicDataCache({ projects: records });
    setProjects(records.map(toProject));
  };

  const loadPublicUpdates = async () => {
    const viewer = user?.id ?? "guest";
    const localDismissed = JSON.parse(window.localStorage.getItem(`aftercode-dismissed-announcements:${viewer}`) || "[]");
    setIsLoadingAnnouncements(true);
    setAnnouncementError("");
    const announcementsPromise = apiRequest(
      user ? "/api/announcements?viewer=auth" : "/api/announcements",
      { authenticated: Boolean(user) }
    ).then((announcementResult) => {
      writePublicDataCache({ announcements: announcementResult.announcements });
      setAnnouncements(announcementResult.announcements);
      setDismissedAnnouncementIds([...new Set([
        ...(announcementResult.dismissedIds ?? []).map(String),
        ...localDismissed.map(String)
      ])]);
    }).catch((error) => {
      setAnnouncementError(error.message);
      throw error;
    }).finally(() => setIsLoadingAnnouncements(false));
    const eventsPromise = apiRequest("/api/events").then((eventResult) => {
      writePublicDataCache({ events: eventResult.events });
      setEvents(eventResult.events);
    });
    await Promise.all([announcementsPromise, eventsPromise]);
  };

  const dismissAnnouncement = async (announcementId) => {
    const id = String(announcementId);
    const viewer = user?.id ?? "guest";
    setDismissedAnnouncementIds((current) => {
      const next = [...new Set([...current.map(String), id])];
      window.localStorage.setItem(`aftercode-dismissed-announcements:${viewer}`, JSON.stringify(next));
      return next;
    });
    if (user) {
      try {
        await apiRequest(`/api/announcements/${encodeURIComponent(id)}`, { method: "PATCH", authenticated: true });
      } catch (error) {
        setDataError(error.message);
      }
    }
  };

  const loadActivities = async () => {
    if (!user) {
      setActivities([]);
      return;
    }
    const { activities: records } = await apiRequest("/api/activity", { authenticated: true });
    setActivities(records);
  };

  const loadNotifications = async () => {
    if (!user) return;
    setIsLoadingNotifications(true);
    try {
      const { notifications: records } = await apiRequest("/api/notifications", { authenticated: true });
      setNotifications(records);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const markNotificationsRead = async () => {
    if (!user) return;
    await apiRequest("/api/notifications", { method: "PATCH", authenticated: true });
    setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
  };

  const loadProjectInteraction = useCallback(async (project) => {
    if (!project.databaseId) return;
    const { interaction } = await apiRequest(
      `/api/project-interactions?projectId=${encodeURIComponent(project.databaseId)}`,
      { authenticated: Boolean(user) }
    );
    setProjectInteractions((current) => ({ ...current, [project.databaseId]: interaction }));
  }, [user]);

  const handleAuthentication = (authenticatedUser) => {
    setUser(authenticatedUser);
    setIsAuthModalOpen(false);
    setAuthError("");
  };

  const toggleProjectFeatured = async (project) => {
    try {
      const { project: updated } = await apiRequest(`/api/projects/${project.databaseId}`, {
        method: "PATCH",
        authenticated: true,
        body: { isFeatured: !project.isFeatured }
      });
      setProjects((current) => current.map((item) => item.databaseId === updated.id
        ? { ...item, isFeatured: updated.is_featured }
        : item));
    } catch (error) {
      setDataError(error.message);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) {
      setAuthError("Supabase is not configured. Unable to sign out.");
      return;
    }

    setAuthError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthError(`Unable to sign out: ${error.message}`);
        return;
      }
      setIsProfileMenuOpen(false);
      setIsCustomizeOpen(false);
      setPage("home");
      setSelectedProject(null);
      setSelectedUserId(null);
      setProfileRouteUsername("");
      setPeopleListRoute(null);
      const url = new URL(window.location.href);
      url.pathname = appRoutePath("/");
      url.searchParams.delete("projectId");
      url.searchParams.delete("project");
      window.history.replaceState({}, "", url);
    } catch (error) {
      setAuthError(`Unable to sign out: ${error.message}`);
    }
  };

  const openAuthModal = (mode = "sign-in") => {
    setAuthError("");
    setAuthModalMode(typeof mode === "string" ? mode : "sign-in");
    setIsAuthModalOpen(true);
  };

  const navigateTo = (nextPage, options = {}) => {
    setPage(nextPage);
    setSelectedProject(options.project ?? null);
    setSelectedUserId(options.userId ?? null);
    setPeopleListRoute(null);

    const ownUsername = String(customization.username || "").trim().replace(/^@/, "");
    const routeUsername = nextPage === "profile"
      ? ownUsername
      : nextPage === "user"
        ? (options.username || (options.userId ? "" : profileRouteUsername))
        : "";
    let pathname = appRoutePath("/");
    if (nextPage === "notifications") pathname = appRoutePath("/notification");
    else if (nextPage === "chat") pathname = appRoutePath("/chat");
    else if (nextPage === "shop") pathname = appRoutePath("/shop");
    else if (nextPage === "explore") pathname = appRoutePath("/explorer");
    else if (nextPage === "user" || nextPage === "profile") pathname = userPagePath(routeUsername || options.userId);
    setProfileRouteUsername(routeUsername || "");
    const url = new URL(window.location.href);
    url.pathname = pathname;
    url.searchParams.delete("projectId");
    url.searchParams.delete("project");
    window.history.pushState({}, "", url);

  };

  const navigateToPeopleList = (list) => {
    const username = profileRouteUsername || String(customization.username || "").trim().replace(/^@/, "");
    setPeopleListRoute(list);
    const url = new URL(window.location.href);
    url.pathname = userPagePath(username, list);
    window.history.pushState({}, "", url);
  };

  const openProject = (project) => {
    setSelectedProject(project);
    setSelectedUserId(null);
    setPage("project");
    window.history.pushState({}, "", projectShareUrl(project.projectNumber ?? project.databaseId));
    setDataError("");
    loadProjectInteraction(project).catch((error) => setDataError(error.message));
  };

  useEffect(() => {
    const projectId = page === "project" ? selectedProject?.databaseId : null;
    if (!projectId) return undefined;

    const lastRequestedAt = viewRequestTimesRef.current.get(projectId) ?? 0;
    if (Date.now() - lastRequestedAt < 10 * 60 * 1000) return undefined;
    viewRequestTimesRef.current.set(projectId, Date.now());

    let active = true;
    apiRequest(`/api/projects/${encodeURIComponent(projectId)}/view`, {
      method: "POST",
      authenticated: Boolean(user),
      body: {}
    }).then(({ views }) => {
      if (!active || !Number.isFinite(views)) return;
      setSelectedProject((current) => current?.databaseId === projectId ? { ...current, views } : current);
      setProjects((current) => current.map((project) => project.databaseId === projectId ? { ...project, views } : project));
    }).catch(() => {
      viewRequestTimesRef.current.delete(projectId);
    });

    return () => { active = false; };
  }, [page, selectedProject?.databaseId, user]);

  useEffect(() => {
    const projectId = getProjectIdFromUrl(window.location.href);
    if (!projectId || page !== "project" || selectedProject?.databaseId === projectId) return undefined;
    let isActive = true;
    apiRequest(`/api/projects/${encodeURIComponent(projectId)}`, { authenticated: Boolean(user) })
      .then(({ project: record }) => {
        if (!isActive) return;
        const project = toProject({ ...record, likes: 0 });
        setSelectedProject(project);
        setPage("project");
        loadProjectInteraction(project).catch((error) => setDataError(error.message));
      })
      .catch((error) => {
        if (isActive) setDataError(error.message);
      });
    return () => { isActive = false; };
  }, [loadProjectInteraction, user, page, selectedProject?.databaseId]);

  const openUserProfile = (userId, username = "") => {
    if (!userId) return;
    navigateTo("user", { userId, username });
  };

  const handlePublicProfileLoaded = (username) => {
    const normalized = String(username || "").trim().replace(/^@/, "");
    if (!normalized || (page !== "user" && page !== "profile") || normalized === profileRouteUsername) return;
    setProfileRouteUsername(normalized);
    const url = new URL(window.location.href);
    url.pathname = userPagePath(normalized, peopleListRoute);
    window.history.replaceState({}, "", url);
  };

  const openNotificationProject = async (notification) => {
    if (!notification.project_id) return;
    const existingProject = projects.find((item) => item.databaseId === notification.project_id);
    if (existingProject) {
      openProject(existingProject);
      return;
    }
    try {
      const { project: record } = await apiRequest(`/api/projects/${encodeURIComponent(notification.project_id)}`, {
        authenticated: Boolean(user)
      });
      openProject(toProject({ ...record, likes: record.likes ?? 0 }));
    } catch (error) {
      setDataError(error.message);
    }
  };

  useEffect(() => {
    const restoreRoute = () => {
      const route = getInitialRoute();
      setPage(route.page);
      setSelectedProject(null);
      setSelectedUserId(null);
      setProfileRouteUsername(route.username);
      setPeopleListRoute(route.peopleList);
    };
    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);

  useEffect(() => {
    if (!profileRouteUsername || (page !== "user" && page !== "profile")) return undefined;
    if (selectedUserId) return undefined;
    let isActive = true;
    apiRequest(`/api/profiles/lookup?username=${encodeURIComponent(profileRouteUsername)}`)
      .then(({ userId }) => {
        if (!isActive) return;
        setSelectedUserId(userId);
        setPage(userId === user?.id ? "profile" : "user");
      })
      .catch((error) => {
        if (isActive) setDataError(error.message);
      });
    return () => { isActive = false; };
  }, [profileRouteUsername, page, selectedUserId, user?.id]);

  const updateProjectInteraction = async (project, action, details = {}) => {
    if (!user) {
      openAuthModal();
      return false;
    }
    if (!project.databaseId) {
      setDataError("This project is not connected to the database.");
      return false;
    }
    const projectId = project.databaseId;
    const previous = projectInteractions[projectId] ?? { likes: 0, liked: false, favorited: false, comments: [] };
    const next = { ...previous, comments: [...(previous.comments ?? [])] };
    if (action === "like") {
      next.liked = Boolean(details.enabled);
      next.likes = Math.max(0, (previous.likes ?? 0) + (details.enabled ? 1 : -1));
    } else if (action === "favorite") {
      next.favorited = Boolean(details.enabled);
      next.favorites = Math.max(0, (previous.favorites ?? 0) + (details.enabled ? 1 : -1));
    } else if (action === "comment") {
      next.comments.push({
        id: `pending-${Date.now()}`,
        userId: user.id,
        author: customization.displayName || user.user_metadata?.display_name || user.email?.split("@")[0] || "You",
        avatarUrl: customization.avatarUrl || user.user_metadata?.avatar_url || "",
        avatarFrame: customization.avatarFrame || "none",
        text: details.text,
        createdAt: new Date().toISOString(),
        pending: true
      });
    }
    setProjectInteractions((current) => ({ ...current, [projectId]: next }));
    try {
      await apiRequest(
        `/api/project-interactions?projectId=${encodeURIComponent(project.databaseId)}`,
        { method: "POST", authenticated: true, body: { action, ...details } }
      );
      if (action === "comment") {
        setProjectInteractions((current) => ({
          ...current,
          [projectId]: {
            ...current[projectId],
            comments: current[projectId].comments.map((comment) => comment.pending
              ? { ...comment, pending: false }
              : comment)
          }
        }));
      }
      Promise.all([loadActivities(), loadNotifications()]).catch(() => {});
      setDataError("");
      return true;
    } catch (error) {
      setProjectInteractions((current) => ({ ...current, [projectId]: previous }));
      setDataError(error.message);
      return false;
    }
  };

  const openCustomizer = () => {
    setIsCustomizeOpen(true);
  };

  const handleSaveCustomization = async (nextCustomization) => {
    setCustomizationError("");
    try {
      await persistCustomization(nextCustomization);
      setCustomization(nextCustomization);
      setIsCustomizeOpen(false);
      return true;
    } catch (error) {
      setCustomizationError(`Unable to save settings: ${error.message}`);
      return false;
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.siteStyle = siteStyle;
    window.localStorage.setItem(SITE_STYLE_STORAGE_KEY, siteStyle);
  }, [siteStyle]);

  useEffect(() => {
    document.documentElement.dataset.compatibilityMode = compatibilityMode ? "true" : "false";
    window.localStorage.setItem(COMPATIBILITY_MODE_STORAGE_KEY, String(compatibilityMode));
  }, [compatibilityMode]);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let isActive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!isActive) return;
      if (error) {
        setAuthError(`Unable to restore your session: ${error.message}`);
        setUser(null);
        setIsRestoringSession(false);
        return;
      }
      setUser(data.session?.user ?? null);
      setIsRestoringSession(false);
    }).catch((error) => {
      if (!isActive) return;
      setAuthError(`Unable to restore your session: ${error.message}`);
      setIsRestoringSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthModalMode("reset-password");
        setIsAuthModalOpen(true);
      }
      setUser(session?.user ?? null);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isRestoringSession) return undefined;

    let isActive = true;
    const userId = user?.id;
    const isFirstDataLoad = !hasCompletedInitialDataLoad.current;
    setDataError("");
    const publicUpdatesPromise = loadPublicUpdates().catch((error) => {
      if (isActive) setDataError(error.message);
    });
    const projectsPromise = apiRequest("/api/projects")
      .then(({ projects: records }) => {
        if (!isActive) return;
        setProjects(records.map(toProject));
        writePublicDataCache({ projects: records });
      })
      .catch((error) => {
        if (isActive) setDataError(error.message);
      })
      .finally(() => {
        if (isActive) setIsLoadingProjects(false);
      });

    let accountDataPromise = Promise.resolve();
    if (userId) {
      accountDataPromise = Promise.all([
        apiRequest("/api/activity", { authenticated: true }),
        apiRequest("/api/notifications", { authenticated: true })
      ]).then(([activityResult, notificationResult]) => {
        if (!isActive) return;
        setActivities(activityResult.activities);
        setNotifications(notificationResult.notifications);
      }).catch((error) => {
        if (isActive) setDataError(error.message);
      });
    } else {
      setActivities([]);
      setNotifications([]);
    }

    const customizationPromise = userId ? (async () => {
      setCustomization(DEFAULT_CUSTOMIZATION);
      try {
        const saved = await loadCustomization();
        if (!isActive) return;
        if (saved) {
          setCustomization(normalizeCustomization(saved));
          return;
        }

        const legacySaved = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
        if (legacySaved) {
          const migrated = normalizeCustomization(JSON.parse(legacySaved));
          await persistCustomization(migrated);
          if (isActive) setCustomization(migrated);
        }
      } catch (error) {
        if (isActive) setCustomizationError(`Unable to load settings: ${error.message}`);
      }
    })() : Promise.resolve();

    Promise.allSettled([publicUpdatesPromise, projectsPromise, accountDataPromise, customizationPromise])
      .then(() => {
        if (!isActive || !isFirstDataLoad) return;
        hasCompletedInitialDataLoad.current = true;
        setIsInitialDataLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [isRestoringSession, user?.id]);

  useEffect(() => {
    if (!user) return undefined;
    let isRefreshing = false;
    const refreshUnreadNotifications = async () => {
      if (isRefreshing || document.visibilityState === "hidden") return;
      isRefreshing = true;
      try {
        const { notifications: records } = await apiRequest("/api/notifications", { authenticated: true });
        setNotifications(records);
      } catch {
        // Keep the last known badge count if a background refresh temporarily fails.
      } finally {
        isRefreshing = false;
      }
    };
    const timer = window.setInterval(refreshUnreadNotifications, 15000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshUnreadNotifications();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [user?.id]);

  if (isRestoringSession || isInitialDataLoading) return <LoadingScreen siteStyle={siteStyle} />;

  if (accountBanNotice) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: "1rem", padding: "2rem", textAlign: "center", background: "#111", color: "#fff" }}>
        <h1>Account banned</h1>
        <p>{accountBanNotice}</p>
        <p>You have been signed out and can no longer use Aftercode with this account.</p>
      </main>
    );
  }

  const activeAccentColor = siteStyle === "brutalist" ? customization.accentColor : "#2679b9";

  return (
    <div
      className="app-layout"
      style={{
        "--accent-yellow": activeAccentColor,
        "--accent-orange": activeAccentColor,
        "--accent-color": activeAccentColor,
        "--brutal-yellow": activeAccentColor,
        "--brutal-orange": activeAccentColor,
        "--yellow": activeAccentColor,
        "--custom-home-background": theme === "dark"
          ? "var(--bg-main)"
          : customization.homeBackground
      }}
    >
      <div className="workspace">
        <header className="header">
          <div className="header-left">
            <button className="topbar-brand" type="button" onClick={() => navigateTo("home")}>
              <img
                className="logo"
                src={LogoIcon}
                alt="Aftercode"
                width="180"
                height="59"
                draggable={false}
              />
            </button>
          </div>

          <nav className="topbar-nav" aria-label="Project navigation">
            <a
              className="icon-btn"
              href="https://aftercode-official.github.io/aftercode-editor/editor.html"
              target="_blank"
              rel="noreferrer"
            >
              Create
            </a>
            <button className="icon-btn" type="button" onClick={() => navigateTo("explore")}>Explore</button>
            <button className={`icon-btn${page === "chat" ? " is-active" : ""}`} type="button" onClick={() => navigateTo("chat")}>Chat</button>
            <button className={`icon-btn${page === "shop" ? " is-active" : ""}`} type="button" onClick={() => navigateTo("shop")}>Shop</button>
          </nav>

          <label className="header-center header-search">
            <span className="visually-hidden">Search projects</span>
            <input
              className="search-input"
              type="search"
              placeholder="Search projects, descriptions, #tags..."
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") navigateTo("explore");
              }}
            />
          </label>

          <div className="header-right">
          <div className="header-appearance-wrap">
            <button
              className={`icon-btn appearance-trigger${isAppearanceMenuOpen ? " is-active" : ""}`}
              type="button"
              aria-label="Appearance settings"
              aria-haspopup="true"
              aria-expanded={isAppearanceMenuOpen}
              onClick={() => {
                setIsProfileMenuOpen(false);
                setIsAppearanceMenuOpen((open) => !open);
              }}
            >
              <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
            </button>
            {isAppearanceMenuOpen && (
              <div className="appearance-dropdown" aria-label="Appearance settings">
                <fieldset className="appearance-option">
                  <legend>Color mode</legend>
                  <div>
                    <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Dark</button>
                    <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Light</button>
                  </div>
                </fieldset>
                <fieldset className="appearance-option">
                  <legend>Interface</legend>
                  <div>
                    <button type="button" aria-pressed={siteStyle === "brutalist"} onClick={() => setSiteStyle("brutalist")}>Brutalist</button>
                    <button type="button" aria-pressed={siteStyle === "classic"} onClick={() => setSiteStyle("classic")}>Aero</button>
                  </div>
                </fieldset>
              </div>
            )}
          </div>
          {isLoggedIn && (
            <>
              <button
                className="icon-btn notifications-trigger"
                type="button"
                aria-label={unreadNotificationCount > 0
                  ? `Notifications, ${unreadNotificationCount} unread`
                  : "Notifications"}
                onClick={() => {
                  navigateTo("notifications");
                  loadNotifications().catch((error) => setDataError(error.message));
                }}
              >
                <span aria-hidden="true">✉</span>
                {unreadNotificationCount > 0 && (
                  <span
                    className="notification-count-badge"
                    role="status"
                    aria-live="polite"
                    aria-label={`${unreadNotificationCount} unread notifications`}
                  >
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                )}
              </button>
              <button
                className="icon-btn upload-project-trigger"
                type="button"
                aria-label="Upload project"
                onClick={() => setIsUploadModalOpen(true)}
              >
                <span aria-hidden="true">▱</span>
              </button>
            </>
          )}

          {!isLoggedIn && (
            <div className="header-auth-actions">
              <button className="signin-btn" type="button" onClick={openAuthModal}>
                Sign In
              </button>
            </div>
          )}

          {(authError || dataError) && <p className="auth-global-error" role="alert">{authError || dataError}</p>}
          {isLoggedIn && (
            <div className="header-profile-menu-wrap">
              <button
                className={`icon-btn header-profile${isProfileMenuOpen ? " is-active" : ""}`}
                type="button"
                data-avatar-frame={customization.avatarFrame}
                aria-label="Open profile menu"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                onClick={() => setIsProfileMenuOpen((open) => !open)}
              >
                {customization.avatarUrl
                  ? <img src={customization.avatarUrl} alt="" />
                  : <span>{customization.displayName.slice(0, 1).toUpperCase()}</span>}
                {customization.avatarFrame === "bear" && <img className="header-avatar-frame" src={BearAvatarFrame} alt="" aria-hidden="true" />}
                {equippedDecoration && <img className="header-avatar-frame" src={equippedDecoration.imageUrl} alt="" aria-hidden="true" />}
              </button>
              {isProfileMenuOpen && (
                <div className="profile-dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={() => {
                    setIsProfileMenuOpen(false);
                    navigateTo("profile");
                  }}>
                    My Profile
                  </button>
                  <button type="button" role="menuitem" onClick={() => {
                    setIsProfileMenuOpen(false);
                    navigateTo("profile");
                    setIsCustomizeOpen(true);
                  }}>
                    Account Settings
                  </button>
                  {isProjectAdmin && (
                    <button type="button" role="menuitem" onClick={() => {
                      setIsProfileMenuOpen(false);
                      navigateTo("admin");
                    }}>
                      Admin Panel
                    </button>
                  )}
                  <button type="button" role="menuitem" className="profile-dropdown-signout" onClick={handleSignOut}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </header>
        <main
          className={`main-feed-container${page === "home" ? ` scratch-home${!isLoggedIn ? " guest-home" : ""}${events.length ? " has-home-events" : ""}` : ""}${page === "profile" || page === "user" ? " profile-page" : ""}${page === "project" ? " project-page-container" : ""}${page === "chat" ? " chat-page-container" : ""}${page === "shop" ? " shop-page-container" : ""}`}
        >
          <Suspense fallback={siteStyle === "classic"
            ? <LoadingScreen siteStyle={siteStyle} inline />
            : <p className="featured-empty">Loading page...</p>}>
          <User
          key={`${page}-${isCustomizeOpen}-${selectedUserId ?? ""}`}
          page={page}
          user={user}
          customization={customization}
          decorations={shopData.decorations}
          ownedDecorationIds={shopData.ownedIds}
          customizationError={customizationError}
          isCustomizeOpen={isCustomizeOpen}
          onOpenCustomizer={openCustomizer}
          onCloseCustomizer={() => setIsCustomizeOpen(false)}
          onSaveCustomization={handleSaveCustomization}
          compatibilityMode={compatibilityMode}
          onCompatibilityModeChange={setCompatibilityMode}
          projects={projects}
          onProjectOpen={openProject}
          selectedUserId={selectedUserId}
          onOpenUserProfile={openUserProfile}
          peopleListRoute={peopleListRoute}
          onPeopleListNavigate={navigateToPeopleList}
          onPublicProfileLoaded={handlePublicProfileLoaded}
        />

          {(page === "explore" || page === "project") && (
            <ProjectPages
              view={page}
              projects={projects}
              selectedProject={selectedProject}
              searchQuery={projectSearch}
              onSearchQueryChange={setProjectSearch}
              onOpenProject={openProject}
              onBack={() => navigateTo("explore")}
              user={user}
              decorations={shopData.decorations}
              onOpenUserProfile={openUserProfile}
              onProjectDeleted={async () => {
                await loadProjects();
                setPage("explore");
                setSelectedProject(null);
              }}
              onProjectUpdated={async (record) => {
                setSelectedProject((current) => current?.databaseId === record.id
                  ? {
                    ...current,
                    title: record.title,
                    author: record.author,
                    description: record.description,
                    category: record.category,
                    tags: record.tags,
                    isPublic: record.is_public,
                    thumbnailPath: record.thumbnail_url || "",
                    thumb: record.thumbnail_url
                      ? (record.thumbnail_url.startsWith("http")
                        ? record.thumbnail_url
                        : supabase.storage.from("project-files").getPublicUrl(record.thumbnail_url).data.publicUrl)
                      : (record.scratch_project_id
                        ? `https://uploads.scratch.mit.edu/get_image/project/${record.scratch_project_id}_480x360.png`
                        : null),
                    scratchProjectId: record.scratch_project_id,
                    assetPath: record.asset_path,
                    projectUrl: record.asset_path
                      ? supabase.storage.from("project-files").getPublicUrl(record.asset_path).data.publicUrl
                      : (record.scratch_project_id
                        ? `https://projects.scratch.mit.edu/${record.scratch_project_id}`
                        : null)
                  }
                  : current);
                try {
                  await loadProjects();
                } catch (error) {
                  setDataError(error.message);
                }
              }}
              interaction={selectedProject
                ? projectInteractions[selectedProject.databaseId] ?? {
                  liked: false,
                  favorited: false,
                  favorites: 0,
                  likes: selectedProject.likes,
                  comments: []
                }
                : undefined}
              onInteractionChange={selectedProject
                ? (action, details) => updateProjectInteraction(selectedProject, action, details)
                : undefined}
              onSignIn={openAuthModal}
              profile={customization}
            />
          )}

          {page === "home" && (
            <>
              {events.slice(0, 1).map((event) => {
                const eventScope = `home-event-${String(event.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
                const thumbnailUrl = event.thumbnail_url && supabase
                  ? supabase.storage.from("project-files").getPublicUrl(event.thumbnail_url).data.publicUrl
                  : "";
                return (
                  <article className="home-event-card" data-event-scope={eventScope} key={event.id}>
                    {event.custom_css && (
                      <style>{`[data-event-scope="${eventScope}"] { ${event.custom_css} }`}</style>
                    )}
                    {thumbnailUrl && <img className="home-event-image" src={thumbnailUrl} alt="" />}
                    <div className="home-event-copy">
                      <span className="home-event-label">EVENT</span>
                      <h2 className="home-event-title">{event.title}</h2>
                      {event.description && <p>{event.description}</p>}
                      <div className="home-event-meta">
                        <time dateTime={event.starts_at}>{new Date(event.starts_at).toLocaleString()}</time>
                        {event.location && <span>{event.location}</span>}
                      </div>
                    </div>
                  </article>
                );
              })}

              {!isLoggedIn && customization.showWelcome && (
                <section className="welcome-card">
                  <div className="welcome-card-copy">
                    <span className="welcome-eyebrow">WELCOME TO AFTERCODE</span>
                    <h1>Discover and share creative projects</h1>
                    <p>
                      Sign in to follow activity, save your favorite projects, and connect
                      with the community.
                    </p>
                    <button className="signin-btn" type="button" onClick={openAuthModal}>
                      Get Started
                    </button>
                  </div>
                  <img className="welcome-card-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" />
                </section>
              )}

              {isLoggedIn && customization.showFeed && (
                <section className="timeline-card">
                  <div className="timeline-header">
                    <h3>What's Happening?</h3>
                    <span className="status-badge">{isLoggedIn ? "Signed In" : "Community"}</span>
                  </div>
                  {dataError
                    ? <p className="feed-empty">{dataError}</p>
                    : activities.length > 0
                      ? <div className="feed-list">
                        {activities.map((activity) => (
                          <button
                            type="button"
                            className="feed-item feed-item-button"
                            key={activity.id}
                            onClick={() => {
                              if (activity.actor_id) openUserProfile(activity.actor_id);
                            }}
                          >
                            {activity.actor_avatar
                              ? <img className="avatar avatar-img" src={activity.actor_avatar} alt="" loading="lazy" decoding="async" />
                              : <div className="avatar">{activity.actor_name.slice(0, 1).toUpperCase()}</div>}
                            <div>
                              <p className="feed-text">
                                <strong>{activity.actor_name}</strong>{" "}
                                {activity.activity_type === "follow"
                                  ? "started following someone"
                                  : activity.activity_type === "project_created"
                                    ? <>shared <em>{activity.project_title}</em></>
                                    : activity.activity_type === "project_liked"
                                      ? <>liked <em>{activity.project_title}</em></>
                                      : <>commented on <em>{activity.project_title}</em></>}
                              </p>
                              <span className="feed-time">{new Date(activity.created_at).toLocaleString()}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      : (
                        <div className="feed-list">
                          <div className="feed-item feed-item-button"><div className="avatar">A</div><div><p className="feed-text"><strong>Aftercode</strong> community projects are ready</p></div></div>
                          <div className="feed-item feed-item-button"><div className="avatar">S</div><div><p className="feed-text"><strong>Scratch</strong> style layout is active</p></div></div>
                        </div>
                      )}
                </section>
              )}

              {isLoggedIn && (
                <section className="home-announcements-section" aria-labelledby="aftercode-news-title">
                  <h2 className="section-title" id="aftercode-news-title">Aftercode News</h2>
                  <div className="home-announcement-list">
                    {visibleAnnouncements.length > 0
                      ? visibleAnnouncements.slice(0, 4).map((item) => (
                          <article className="home-announcement-card" key={item.id}>
                            <div className="home-announcement-copy">
                              <span className="home-update-label">AFTERCODE UPDATE</span>
                              <h3>{item.title}</h3>
                              <p>{item.message}</p>
                            </div>
                          </article>
                        ))
                      : <p className="home-announcement-empty" role={announcementError ? "alert" : "status"}>
                          {announcementError || (isLoadingAnnouncements
                            ? "Loading announcements..."
                            : "No announcements yet.")}
                        </p>}
                  </div>
                </section>
              )}

              {customization.showFeatured && (
                <section className="featured-hero" id="featured-projects">
                  <ProjectRail
                    title="Featured Projects"
                    onViewAll={() => navigateTo("explore")}
                  >
                    {featuredProjects.length > 0 ? (
                      <div className="featured-grid">
                        {featuredProjects.map((project, index) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            index={index}
                            onOpenProject={openProject}
                            showFeaturedBadge
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="featured-empty">
                        {dataError || (isLoadingProjects
                          ? "Loading projects..."
                          : isProjectAdmin
                            ? "No featured projects yet. Choose projects in Recent Projects below."
                            : "No featured projects have been selected yet.")}
                      </p>
                    )}
                  </ProjectRail>
                </section>
              )}

              <section className="featured-hero recent-projects-section" id="recent-projects">
                <ProjectRail
                  title="Recent Projects"
                  onViewAll={() => navigateTo("explore")}
                >
                  {projects.length > 0 ? (
                    <div className="featured-grid">
                      {projects.map((project, index) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          index={index}
                          onOpenProject={openProject}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="featured-empty">{dataError || (isLoadingProjects ? "Loading projects..." : "No projects have been uploaded yet.")}</p>
                  )}
                </ProjectRail>
              </section>
            </>
          )}
          {page === "chat" && <ChatCenter user={user} avatarFrame={customization.avatarFrame} decorations={shopData.decorations} onSignIn={openAuthModal} onOpenProject={openProject} onOpenUserProfile={openUserProfile} onMessageSent={refreshShopData} />}
          {page === "shop" && (
            <ProfileShop
              user={user}
              shopData={shopData}
              onRefreshShop={refreshShopData}
              equippedFrame={customization.avatarFrame}
              onEquipFrame={(frame) => handleSaveCustomization({ ...customization, avatarFrame: frame })}
              onSignIn={openAuthModal}
            />
          )}
          {page === "notifications" && user && (
            <NotificationsPage
              notifications={notifications}
              isLoading={isLoadingNotifications}
              onMarkAllRead={() => markNotificationsRead().catch((error) => setDataError(error.message))}
              onOpenProject={openNotificationProject}
              onOpenUserProfile={openUserProfile}
            />
          )}
          {page === "admin" && isProjectAdmin && (
            <AdminPanel
              projects={projects}
              events={events}
              user={user}
              onToggleFeatured={toggleProjectFeatured}
              onOpenProject={openProject}
              onDecorationAdded={() => refreshShopData()}
              onCreateAnnouncement={async (payload) => {
                const result = await apiRequest("/api/announcements", { method: "POST", authenticated: true, body: payload });
                if (result.announcement) {
                  setAnnouncements([result.announcement]);
                  writePublicDataCache({ announcements: [result.announcement] });
                  setDismissedAnnouncementIds([]);
                }
                return result;
              }}
              onCreateEvent={async (payload) => {
                const result = await apiRequest("/api/events", { method: "POST", authenticated: true, body: payload });
                if (result.event) {
                  const nextEvents = [result.event, ...events.filter((item) => item.id !== result.event.id)]
                    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
                  setEvents(nextEvents);
                  writePublicDataCache({ events: nextEvents });
                }
                loadNotifications().catch(() => {});
                return result;
              }}
              onDeleteEvent={async (event) => {
                await apiRequest(`/api/events/${encodeURIComponent(event.id)}`, { method: "DELETE", authenticated: true });
                const nextEvents = events.filter((item) => item.id !== event.id);
                setEvents(nextEvents);
                writePublicDataCache({ events: nextEvents });
                loadNotifications().catch(() => {});
              }}
              error={dataError}
            />
          )}
          </Suspense>
        </main>
        <footer className="site-footer">
          <span>© {new Date().getFullYear()} Aftercode</span>
          <span className="footer-divider" aria-hidden="true" />
          <a href="https://discord.gg/vK2cAfdsP" target="_blank" rel="noreferrer">
            <svg aria-hidden="true" viewBox="0 0 20 19"><use href={`${import.meta.env.BASE_URL}icons.svg#discord-icon`} /></svg>
            <span>Join our Discord</span>
          </a>
        </footer>
      </div>
      {isAuthModalOpen && (
        <Suspense fallback={null}>
          <AuthModal
            onClose={() => setIsAuthModalOpen(false)}
            onAuthenticated={handleAuthentication}
            initialMode={authModalMode}
          />
        </Suspense>
      )}
      {isUploadModalOpen && user && (
        <Suspense fallback={null}>
          <UploadProjectModal
            user={user}
            onClose={() => setIsUploadModalOpen(false)}
            onPublished={(record) => {
              if (record) {
                const project = toProject(record);
                setProjects((current) => [project, ...current.filter((item) => item.databaseId !== project.databaseId)]);
              }
              setPage("explore");
              setSelectedProject(null);
              Promise.all([loadProjects(), loadActivities()]).catch((error) => setDataError(error.message));
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function ProjectRail({ title, onViewAll, children }) {
  const railRef = useRef(null);

  const scrollRail = (direction) => {
    railRef.current?.scrollBy({
      left: direction * 360,
      behavior: "smooth"
    });
  };

  return (
    <div className="project-rail">
      <div className="project-rail-header">
        <h2 className="section-title">{title}</h2>
        <div className="project-rail-actions">
          <button className="project-scroll-btn" type="button" aria-label={`Scroll ${title} left`} onClick={() => scrollRail(-1)}>‹</button>
          <button className="project-scroll-btn" type="button" aria-label={`Scroll ${title} right`} onClick={() => scrollRail(1)}>›</button>
          <button className="project-view-all" type="button" onClick={onViewAll}>View All</button>
        </div>
      </div>
      <div className="project-scroll-wrapper" ref={railRef}>
        {children}
      </div>
    </div>
  );
}

function ProjectCard({ project, index, onOpenProject, showFeaturedBadge = false }) {
  return (
    <article className="featured-card home-project-card" style={{ "--delay": index + 1 }}>
      <button className="home-project-open" type="button" onClick={() => onOpenProject(project)}>
        <div className="featured-thumb-wrapper">
          <ProjectThumbnail
            project={project}
            alt={project.title}
            loading={index < 4 ? "eager" : "lazy"}
            fetchPriority={index < 4 ? "high" : "low"}
          />
          {showFeaturedBadge && <span className="featured-badge">FEATURED</span>}
        </div>
        <div className="featured-info">
          <h3>{project.title}</h3>
          <p className="featured-author">
            {project.authorAvatar
              ? <img className="avatar avatar-xs avatar-img" src={project.authorAvatar} alt="" loading="lazy" decoding="async" />
              : <span className="avatar avatar-xs">{project.author.slice(0, 1).toUpperCase()}</span>}
            <span>by {project.author}</span>
          </p>
        </div>
      </button>
    </article>
  );
}
