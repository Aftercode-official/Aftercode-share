import { useCallback, useEffect, useState } from "react";
import "./App.css";
import User from "./User.jsx";
import ProjectPages from "./ProjectPages.jsx";
import { loadCustomization, saveCustomization as persistCustomization } from "./userStorage.js";
import { supabase } from "./supabase.js";
import AuthModal from "./AuthModal.jsx";
import { apiRequest } from "./api.js";
import UploadProjectModal from "./UploadProjectModal.jsx";
import LogoIcon from "./assets/Logo.png";
import LoadingScreen from "./LoadingScreen.jsx";
import ChatCenter from "./ChatCenter.jsx";
import ProjectThumbnail from "./ProjectThumbnail.jsx";
import AdminPanel from "./AdminPanel.jsx";
import NotificationsPage from "./NotificationsPage.jsx";
import { getProjectIdFromUrl, projectShareUrl } from "./projectLinks.js";
import "./ClassicTheme.css";

const THEME_STORAGE_KEY = "aftercode-share-theme";
const CUSTOMIZATION_STORAGE_KEY = "aftercode-share-customization";
const DEFAULT_CUSTOMIZATION = {
  displayName: "Name",
  username: "@IDName",
  bio: "Sharing the projects I love.",
  avatarUrl: "",
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

function toProject(record) {
  const projectUrl = record.asset_path
    ? supabase.storage.from("project-files").getPublicUrl(record.asset_path).data.publicUrl
    : null;
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
    userId: record.user_id,
    scratchProjectId: record.scratch_project_id,
    assetPath: record.asset_path,
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
    views: 0,
    likes: record.likes
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const isLoggedIn = Boolean(user);
  const [projects, setProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState([]);
  const [events, setEvents] = useState([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const unreadNotificationCount = notifications.filter((notification) => !notification.is_read).length;
  const [dataError, setDataError] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [page, setPage] = useState(() => getProjectIdFromUrl(window.location.href) ? "project" : "home");
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectInteractions, setProjectInteractions] = useState({});
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    window.matchMedia("(min-width: 761px)").matches
  );
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "dark" ? "dark" : "light";
  });
  const [customization, setCustomization] = useState(DEFAULT_CUSTOMIZATION);
  const [customizationError, setCustomizationError] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const isProjectAdmin = user?.id === "5c7667c5-7119-44fc-bd62-28ba3d4507d0";
  const featuredProjects = projects.filter((project) => project.isFeatured);

  const loadProjects = async () => {
    const { projects: records } = await apiRequest("/api/projects");
    setProjects(records.map(toProject));
  };

  const loadPublicUpdates = async () => {
    const viewer = user?.id ?? "guest";
    const localDismissed = JSON.parse(window.localStorage.getItem(`aftercode-dismissed-announcements:${viewer}`) || "[]");
    const [announcementResult, eventResult] = await Promise.all([
      apiRequest(user ? "/api/announcements?viewer=auth" : "/api/announcements", { authenticated: Boolean(user) }),
      apiRequest("/api/events")
    ]);
    setAnnouncements(announcementResult.announcements);
    setDismissedAnnouncementIds([...new Set([...(announcementResult.dismissedIds ?? []).map(String), ...localDismissed.map(String)])]);
    setEvents(eventResult.events);
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
    setIsSidebarOpen(window.matchMedia("(min-width: 761px)").matches);
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
      setIsSidebarOpen(false);
      setIsCustomizeOpen(false);
      setPage("home");
      setSelectedProject(null);
      const url = new URL(window.location.href);
      url.pathname = "/";
      url.searchParams.delete("projectId");
      url.searchParams.delete("project");
      window.history.replaceState({}, "", url);
    } catch (error) {
      setAuthError(`Unable to sign out: ${error.message}`);
    }
  };

  const openAuthModal = () => {
    setAuthError("");
    setIsAuthModalOpen(true);
  };

  const navigateTo = (nextPage, options = {}) => {
    setPage(nextPage);
    setSelectedProject(options.project ?? null);
    setSelectedUserId(options.userId ?? null);
    if (nextPage !== "project") {
      const url = new URL(window.location.href);
      url.pathname = "/";
      url.searchParams.delete("projectId");
      url.searchParams.delete("project");
      window.history.replaceState({}, "", url);
    }
    if (!window.matchMedia("(min-width: 761px)").matches) {
      setIsSidebarOpen(false);
    }
  };

  const openProject = (project) => {
    setSelectedProject(project);
    setSelectedUserId(null);
    setPage("project");
    window.history.replaceState({}, "", projectShareUrl(project.databaseId));
    setDataError("");
    loadProjectInteraction(project).catch((error) => setDataError(error.message));
  };

  useEffect(() => {
    const projectId = getProjectIdFromUrl(window.location.href);
    if (!projectId) return undefined;
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
  }, [loadProjectInteraction, user]);

  const openUserProfile = (userId) => {
    if (!userId) return;
    navigateTo("user", { userId });
  };

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
    } else if (action === "comment") {
      next.comments.push({
        id: `pending-${Date.now()}`,
        userId: user.id,
        author: customization.displayName || user.user_metadata?.display_name || user.email?.split("@")[0] || "You",
        avatarUrl: customization.avatarUrl || user.user_metadata?.avatar_url || "",
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

  const favoriteProjectIds = Object.entries(projectInteractions)
    .filter(([, interaction]) => interaction.favorited)
    .map(([projectId]) => projectId);

  const openCustomizer = () => {
    setIsCustomizeOpen(true);
  };

  const handleSaveCustomization = async (nextCustomization) => {
    setCustomizationError("");
    try {
      await persistCustomization(nextCustomization);
      setCustomization(nextCustomization);
      setIsCustomizeOpen(false);
    } catch (error) {
      setCustomizationError(`Unable to save settings: ${error.message}`);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!isBooting) return undefined;
    const timer = setTimeout(() => setIsBooting(false), 8000);
    return () => clearTimeout(timer);
  }, [isBooting]);

  // Safety net: tự tắt loading sau 8s nếu có gì treo
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
        return;
      }
      setUser(data.session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const userId = user?.id;
    loadPublicUpdates().catch((error) => {
      if (isActive) setDataError(error.message);
    });

    const load = async () => {
      const extrasPromise = userId
        ? Promise.all([
          apiRequest("/api/activity", { authenticated: true }),
          apiRequest("/api/notifications", { authenticated: true })
        ]).catch((error) => {
          if (isActive) setDataError(error.message);
          return null;
        })
        : Promise.resolve(null);

      try {
        const { projects: records } = await apiRequest("/api/projects");
        if (!isActive) return;
        setProjects(records.map(toProject));
        setDataError("");
        setIsLoadingProjects(false);
        setIsBooting(false);

        if (userId) {
          const results = await extrasPromise;
          if (!isActive) return;
          if (results) {
            const [activityResult, notificationResult] = results;
            setActivities(activityResult.activities);
            setNotifications(notificationResult.notifications);
          }
        } else {
          setActivities([]);
          setNotifications([]);
        }
        if (isActive) setDataError("");
      } catch (error) {
        if (isActive) {
          setDataError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoadingProjects(false);
          setIsBooting(false);
        }
      }
    };

    load();
    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return undefined;
    const refreshUnreadNotifications = async () => {
      try {
        const { notifications: records } = await apiRequest("/api/notifications", { authenticated: true });
        setNotifications(records);
      } catch {
        // Keep the last known badge count if a background refresh temporarily fails.
      }
    };
    const timer = window.setInterval(refreshUnreadNotifications, 30000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  useEffect(() => {
    let isActive = true;

    const restoreCustomization = async () => {
      try {
        const saved = await loadCustomization();
        if (!isActive) return;
        if (saved) {
          setCustomization({ ...DEFAULT_CUSTOMIZATION, ...saved });
        } else {
          const legacySaved = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
          if (legacySaved) {
            const migrated = { ...DEFAULT_CUSTOMIZATION, ...JSON.parse(legacySaved) };
            await persistCustomization(migrated);
            if (!isActive) return;
            setCustomization(migrated);
          }
        }
      } catch (error) {
        if (isActive) {
          setCustomizationError(`Unable to load settings: ${error.message}`);
        }
      }
    };

    restoreCustomization();
    return () => {
      isActive = false;
    };
  }, [user?.id]);

  if (isBooting) {
    return <LoadingScreen />;
  }

  return (
    <div
      className={`app-layout${isLoggedIn ? " has-sidebar" : ""}${isSidebarOpen ? "" : " sidebar-collapsed"}`}
      style={{
        "--accent-yellow": customization.accentColor,
        "--accent-orange": customization.accentColor,
        "--custom-home-background": theme === "dark"
          ? "var(--bg-main)"
          : customization.homeBackground
      }}
    >
      {isLoggedIn && (
        <aside
          className="sidebar"
          id="app-sidebar"
          aria-label="Sidebar navigation"
          inert={!isSidebarOpen}
        >
          <div className="sidebar-profile">
            {customization.avatarUrl
              ? <img className="sidebar-avatar" src={customization.avatarUrl} alt="" />
              : <div className="sidebar-avatar" aria-hidden="true">{customization.displayName.slice(0, 1)}</div>}
            <div className="sidebar-profile-copy">
              <strong>{customization.displayName}</strong>
              <span>{customization.username}</span>
            </div>
          </div>
          <nav className="sidebar-nav" aria-label="Account navigation">
            <button className="sidebar-nav-btn" type="button" onClick={() => navigateTo("home")}>⌂ <span>Home</span></button>
            <button className="sidebar-nav-btn" type="button" onClick={() => navigateTo("home")}>★ <span>Featured Projects</span></button>
            <button className="sidebar-nav-btn" type="button" onClick={() => navigateTo("chat")}>◌ <span>Community Chat</span></button>
            {isProjectAdmin && <button className={`sidebar-nav-btn${page === "admin" ? " is-active" : ""}`} type="button" onClick={() => navigateTo("admin")}>⚙ <span>Admin Panel</span></button>}
            <button className="sidebar-nav-btn" type="button" onClick={() => navigateTo("profile")}>◉ <span>View Profile</span></button>
            <button className="sidebar-nav-btn" type="button" onClick={openCustomizer}>⚙ <span>Customize Page</span></button>
          </nav>
          <div className="sidebar-account">
            <span className="sidebar-section-label">ACCOUNT</span>
            <button className="sidebar-nav-btn" type="button" onClick={handleSignOut}>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>
      )}

      {isLoggedIn && isSidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

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
              href="https://aftercode-web-wheat.vercel.app/editor.html"
              target="_blank"
              rel="noreferrer"
            >
              ＋ Create
            </a>
            <button className="icon-btn" type="button" onClick={() => navigateTo("explore")}>⌕ Explore</button>
            <button className={`icon-btn${page === "chat" ? " is-active" : ""}`} type="button" onClick={() => navigateTo("chat")}>Chat</button>
            <button
              className="icon-btn upload-project-trigger"
              type="button"
              onClick={() => {
                if (user) setIsUploadModalOpen(true);
                else openAuthModal();
              }}
            >
              ↑ Upload
            </button>
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
          {isLoggedIn && (
            <>
              <button
                className="icon-btn notifications-trigger"
                type="button"
                onClick={() => {
                  navigateTo("notifications");
                  loadNotifications().catch((error) => setDataError(error.message));
                }}
              >
                Notifications
                {unreadNotificationCount > 0 && <span className="notification-count-badge">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
              </button>
            </>
          )}
          <button
            className="icon-btn theme-toggle"
            type="button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>

          {!isLoggedIn && (
            <button className="signin-btn" type="button" onClick={openAuthModal}>
              Sign In
            </button>
          )}

          {(authError || dataError) && <p className="auth-global-error" role="alert">{authError || dataError}</p>}
          {isLoggedIn && (
            <button
              className="sidebar-toggle"
              type="button"
              aria-label={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-expanded={isSidebarOpen}
              aria-controls="app-sidebar"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              ☰
            </button>
          )}
          </div>
        </header>
        <main
          className={`main-feed-container${page === "profile" || page === "user" ? " profile-page" : ""}${page === "project" ? " project-page-container" : ""}${page === "chat" ? " chat-page-container" : ""}`}
        >
          <User
          key={`${page}-${isCustomizeOpen}-${selectedUserId ?? ""}`}
          page={page}
          user={user}
          customization={customization}
          customizationError={customizationError}
          isCustomizeOpen={isCustomizeOpen}
          onOpenCustomizer={openCustomizer}
          onCloseCustomizer={() => setIsCustomizeOpen(false)}
          onSaveCustomization={handleSaveCustomization}
          projects={projects}
          favoriteProjectIds={favoriteProjectIds}
          onProjectOpen={openProject}
          selectedUserId={selectedUserId}
          onOpenUserProfile={openUserProfile}
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
                    scratchProjectId: record.scratch_project_id,
                    assetPath: record.asset_path,
                    projectUrl: record.asset_path
                      ? supabase.storage.from("project-files").getPublicUrl(record.asset_path).data.publicUrl
                      : null
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
              {announcements.some((announcement) => !dismissedAnnouncementIds.includes(String(announcement.id))) && (
                <section className="home-announcements-section" aria-labelledby="home-announcements-title">
                  <h2 className="section-title" id="home-announcements-title">Announcements</h2>
                  <div className="home-announcement-list">
                    {announcements.filter((announcement) => !dismissedAnnouncementIds.includes(String(announcement.id))).map((announcement) => (
                      <article className="home-announcement-card" key={announcement.id}>
                        <div className="home-announcement-copy">
                          <span className="home-update-label">AFTERCODE UPDATE</span>
                          <h3>{announcement.title}</h3>
                          <p>{announcement.message}</p>
                        </div>
                        <footer className="home-announcement-footer">
                          <time dateTime={announcement.created_at}>{new Date(announcement.created_at).toLocaleString()}</time>
                          <button className="home-announcement-dismiss" type="button" onClick={() => dismissAnnouncement(announcement.id)}>OK</button>
                        </footer>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {events.length > 0 && (
                <section className="home-events-section" aria-labelledby="home-events-title">
                  <h2 className="section-title" id="home-events-title">Upcoming Events</h2>
                  <div className="home-event-list">
                    {events.map((event) => (
                      <article className="home-event-card" key={event.id}>
                        {event.thumbnail_url
                          ? <img src={supabase.storage.from("project-files").getPublicUrl(event.thumbnail_url).data.publicUrl} alt="" />
                          : <div className="home-event-placeholder" aria-hidden="true">EVENT</div>}
                        <div className="home-event-copy">
                          <span className="home-update-label">COMMUNITY EVENT</span>
                          <h3>{event.title}</h3>
                          <time dateTime={event.starts_at}>{new Date(event.starts_at).toLocaleString()}</time>
                          {event.location && <p className="home-event-location">{event.location}</p>}
                          {event.description && <p>{event.description}</p>}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {!isLoggedIn && customization.showWelcome && (
                <section className="welcome-card">
                  <span className="welcome-eyebrow">WELCOME TO AFTERCODE</span>
                  <h1>Discover and share creative projects</h1>
                  <p>
                    Sign in to follow activity, save your favorite projects, and connect
                    with the community.
                  </p>
                  <button className="signin-btn" type="button" onClick={openAuthModal}>
                    Get Started
                  </button>
                </section>
              )}

              {isLoggedIn && customization.showFeed && (
                <section className="timeline-card">
                  <div className="timeline-header">
                    <h3>Community Activity</h3>
                    <span className="status-badge">Signed In</span>
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
                              if (activity.actor_id) {
                                openUserProfile(activity.actor_id);
                              }
                            }}
                          >
                            {activity.actor_avatar
                              ? <img className="avatar avatar-img" src={activity.actor_avatar} alt="" />
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
                      : <p className="feed-empty">{isLoadingProjects ? "Loading activity..." : "No activity yet."}</p>}
                </section>
              )}

              {customization.showFeatured && (
                <section className="featured-hero" id="featured-projects">
                  <h2 className="section-title">Featured Projects</h2>
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
                </section>
              )}

              <section className="featured-hero recent-projects-section" id="recent-projects">
                <h2 className="section-title">Recent Projects</h2>
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
              </section>
            </>
          )}
          {page === "chat" && <ChatCenter user={user} onSignIn={openAuthModal} onOpenProject={openProject} />}
          {page === "notifications" && user && (
            <NotificationsPage
              notifications={notifications}
              isLoading={isLoadingNotifications}
              onMarkAllRead={() => markNotificationsRead().catch((error) => setDataError(error.message))}
              onOpenProject={(notification) => {
                const project = projects.find((item) => item.databaseId === notification.project_id);
                if (project) openProject(project);
              }}
            />
          )}
          {page === "admin" && isProjectAdmin && (
            <AdminPanel
              projects={projects}
              events={events}
              user={user}
              onToggleFeatured={toggleProjectFeatured}
              onOpenProject={openProject}
              onCreateAnnouncement={async (payload) => {
                const result = await apiRequest("/api/announcements", { method: "POST", authenticated: true, body: payload });
                if (result.announcement) {
                  setAnnouncements((current) => [result.announcement, ...current.filter((item) => item.id !== result.announcement.id)].slice(0, 10));
                }
                return result;
              }}
              onCreateEvent={async (payload) => {
                const result = await apiRequest("/api/events", { method: "POST", authenticated: true, body: payload });
                if (result.event) {
                  setEvents((current) => [result.event, ...current.filter((item) => item.id !== result.event.id)].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));
                }
                loadNotifications().catch(() => {});
                return result;
              }}
              onDeleteEvent={async (event) => {
                await apiRequest(`/api/events/${encodeURIComponent(event.id)}`, { method: "DELETE", authenticated: true });
                setEvents((current) => current.filter((item) => item.id !== event.id));
                loadNotifications().catch(() => {});
              }}
              error={dataError}
            />
          )}
        </main>
      </div>
      {isAuthModalOpen && (
        <AuthModal
          onClose={() => setIsAuthModalOpen(false)}
          onAuthenticated={handleAuthentication}
        />
      )}
      {isUploadModalOpen && user && (
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
      )}
    </div>
  );
}

function ProjectCard({ project, index, onOpenProject, showFeaturedBadge = false }) {
  return (
    <article className="featured-card home-project-card" style={{ "--delay": index + 1 }}>
      <button className="home-project-open" type="button" onClick={() => onOpenProject(project)}>
        <div className="featured-thumb-wrapper">
          <ProjectThumbnail project={project} alt={project.title} />
          {showFeaturedBadge && <span className="featured-badge">FEATURED</span>}
        </div>
        <div className="featured-info">
          <h3>{project.title}</h3>
          <p className="featured-author">
            {project.authorAvatar
              ? <img className="avatar avatar-xs avatar-img" src={project.authorAvatar} alt="" />
              : <span className="avatar avatar-xs">{project.author.slice(0, 1).toUpperCase()}</span>}
            <span>by {project.author}</span>
          </p>
        </div>
      </button>
    </article>
  );
}
