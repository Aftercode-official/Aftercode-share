import { useEffect, useState } from "react";
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
  return {
    id: record.id,
    databaseId: record.id,
    userId: record.user_id,
    scratchProjectId: record.scratch_project_id,
    projectUrl,
    title: record.title,
    author: record.author,
    thumb: record.scratch_project_id
      ? `https://uploads.scratch.mit.edu/get_image/project/${record.scratch_project_id}_480x360.png`
      : null,
    category: record.category,
    description: record.description,
    tags: record.tags,
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
  const [events, setEvents] = useState([]);
  const [dataError, setDataError] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [page, setPage] = useState("home");
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectInteractions, setProjectInteractions] = useState({});
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    window.matchMedia("(min-width: 761px)").matches
  );
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "dark" ? "dark" : "light";
  });
  const [customization, setCustomization] = useState(DEFAULT_CUSTOMIZATION);
  const [customizationError, setCustomizationError] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  const toggleDropdown = (name) => {
    const nextDropdown = activeDropdown === name ? null : name;
    setActiveDropdown(nextDropdown);
    if (nextDropdown) {
      setDataError("");
      const loadDropdown = nextDropdown === "notif"
        ? async () => {
          await loadNotifications();
          await markNotificationsRead();
        }
        : loadEvents;
      loadDropdown().catch((error) => setDataError(error.message));
    }
  };

  const loadProjects = async () => {
    const { projects: records } = await apiRequest("/api/projects");
    setProjects(records.map(toProject));
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
    const { notifications: records } = await apiRequest("/api/notifications", { authenticated: true });
    setNotifications(records);
  };

  const markNotificationsRead = async () => {
    if (!user) return;
    await apiRequest("/api/notifications", { method: "PATCH", authenticated: true });
    setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
  };

  const loadEvents = async () => {
    const { events: records } = await apiRequest("/api/events");
    setEvents(records);
  };

  const loadProjectInteraction = async (project) => {
    if (!project.databaseId) return;
    const { interaction } = await apiRequest(
      `/api/project-interactions?projectId=${encodeURIComponent(project.databaseId)}`,
      { authenticated: Boolean(user) }
    );
    setProjectInteractions((current) => ({ ...current, [project.databaseId]: interaction }));
  };

  const handleAuthentication = (authenticatedUser) => {
    setUser(authenticatedUser);
    setIsAuthModalOpen(false);
    setAuthError("");
    setIsSidebarOpen(window.matchMedia("(min-width: 761px)").matches);
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
      setActiveDropdown(null);
      setIsCustomizeOpen(false);
      setPage("home");
      setSelectedProject(null);
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
    setActiveDropdown(null);
    if (!window.matchMedia("(min-width: 761px)").matches) {
      setIsSidebarOpen(false);
    }
  };

  const openProject = (project) => {
    setSelectedProject(project);
    setSelectedUserId(null);
    setPage("project");
    setDataError("");
    loadProjectInteraction(project).catch((error) => setDataError(error.message));
  };

  const openUserProfile = (userId) => {
    if (!userId) return;
    navigateTo("user", { userId });
  };

  const updateProjectInteraction = async (project, action, details = {}) => {
    if (!project.databaseId) {
      setDataError("This project is not connected to the database.");
      return false;
    }
    try {
      const { interaction } = await apiRequest(
        `/api/project-interactions?projectId=${encodeURIComponent(project.databaseId)}`,
        { method: "POST", authenticated: true, body: { action, ...details } }
      );
      setProjectInteractions((current) => ({ ...current, [project.databaseId]: interaction }));
      await Promise.all([loadActivities(), loadNotifications(), loadProjects()]);
      setDataError("");
      return true;
    } catch (error) {
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

  // Safety net: tự tắt loading sau 8s nếu có gì treo
  useEffect(() => {
    if (!isBooting) return undefined;
    const timer = setTimeout(() => setIsBooting(false), 8000);
    return () => clearTimeout(timer);
  }, [isBooting]);

  useEffect(() => {
    if (!supabase) {
      setIsBooting(false);
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

    const load = async () => {
      setDataReady(false);
      setIsBooting(true);
      try {
        const { projects: records } = await apiRequest("/api/projects");
        if (!isActive) return;
        setProjects(records.map(toProject));

        if (userId) {
          const [activityResult, notificationResult] = await Promise.all([
            apiRequest("/api/activity", { authenticated: true }),
            apiRequest("/api/notifications", { authenticated: true })
          ]);
          if (!isActive) return;
          setActivities(activityResult.activities);
          setNotifications(notificationResult.notifications);
        } else {
          setActivities([]);
          setNotifications([]);
        }
        if (isActive) setDataError("");
      } catch (error) {
        if (isActive) {
          setDataError(error.message);
          setDataReady(true);
        }
      } finally {
        if (isActive) {
          setIsLoadingProjects(false);
          setDataReady(true);
        }
      }
    };

    load();
    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let isActive = true;

    const restoreCustomization = async () => {
      setProfileReady(false);
      setIsBooting(true);
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
        if (isActive) setProfileReady(true);
      } catch (error) {
        if (isActive) {
          setCustomizationError(`Unable to load settings: ${error.message}`);
          setProfileReady(true);
        }
      }
    };

    restoreCustomization();
    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (dataReady && profileReady) {
      setIsBooting(false);
    }
  }, [dataReady, profileReady]);

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
              placeholder="Search projects..."
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
                onClick={() => toggleDropdown("notif")}
              >
                Notifications
                {notifications.some((notification) => !notification.is_read) && <span className="badge-dot" />}
              </button>
              <button
                className="icon-btn events-trigger"
                type="button"
                onClick={() => toggleDropdown("events")}
              >
                Events
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

          {isLoggedIn && activeDropdown === "notif" && (
          <div className="dropdown-menu">
            {notifications.length > 0
              ? notifications.map((notification) => (
                <button
                  type="button"
                  className="dropdown-item dropdown-item-button"
                  key={notification.id}
                  onClick={() => {
                    if (notification.actor_id) {
                      setActiveDropdown(null);
                      openUserProfile(notification.actor_id);
                    }
                  }}
                >
                  <strong>{notification.actor_name}</strong>{" "}
                  {notification.notification_type === "follow"
                    ? "started following you"
                    : notification.notification_type === "project_liked"
                      ? <>liked <em>{notification.project_title}</em></>
                      : <>commented on <em>{notification.project_title}</em></>}
                  <p>{new Date(notification.created_at).toLocaleString()}</p>
                </button>
              ))
              : <p className="dropdown-empty">No notifications yet.</p>}
          </div>
        )}

          {isLoggedIn && activeDropdown === "events" && (
            <div className="dropdown-menu">
              {events.length > 0
                ? events.map((event) => (
                  <div className="dropdown-item" key={event.id}>
                    <strong>{event.title}</strong>
                    <p>{new Date(event.starts_at).toLocaleString()}</p>
                    {event.location && <p>{event.location}</p>}
                  </div>
                ))
                : <p className="dropdown-empty">No upcoming events yet.</p>}
            </div>
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
          className={`main-feed-container${page === "profile" || page === "user" ? " profile-page" : ""}${page === "project" ? " project-page-container" : ""}`}
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
              profile={customization}
            />
          )}

          {page === "home" && (
            <>
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
                            <div className="avatar">{activity.actor_name.slice(0, 1).toUpperCase()}</div>
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
                    <p className="featured-empty">{dataError || (isLoadingProjects ? "Loading projects..." : "No featured projects yet.")}</p>
                  )}
                </section>
              )}
            </>
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
          onPublished={async () => {
            await Promise.all([loadProjects(), loadActivities()]);
            setPage("explore");
            setSelectedProject(null);
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, index, onOpenProject }) {
  return (
    <button
      className="featured-card home-project-card"
      type="button"
      style={{ "--delay": index + 1 }}
      onClick={() => onOpenProject(project)}
    >
      <div className="featured-thumb-wrapper">
        {project.thumb
          ? <img src={project.thumb} alt={project.title} className="featured-thumb" />
          : <span className="sb3-thumbnail" aria-label="Scratch project file">SB3</span>}
        <span className="featured-badge">FEATURED</span>
      </div>
      <div className="featured-info">
        <h3>{project.title}</h3>
        <p>by {project.author}</p>
      </div>
    </button>
  );
}