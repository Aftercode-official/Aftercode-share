import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabase.js";
import "./AuthModal.css";
import HCaptcha from "@hcaptcha/react-hcaptcha";

export default function AuthModal({ onClose, onAuthenticated }) {
  const [mode, setMode] = useState("sign-in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      if (mode === "sign-up") {
        const trimmedName = displayName.trim();
        const trimmedEmail = email.trim();

        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { data: { display_name: trimmedName } }
        });
        if (authError) throw authError;

        if (data.user) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            await fetch("/api/profiles/me", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({
                displayName: trimmedName,
                username: trimmedName
              })
            });
          }
        }

        if (data.session) {
          onAuthenticated(data.user);
          return;
        }
        changeMode("sign-in");
        setMessage("Account created. Check your email to confirm your address, then sign in.");
      } else {
        const trimmedUsername = username.trim().replace(/^@/, "");
        if (!trimmedUsername) {
          throw new Error("Enter your username.");
        }

        // Sign in qua server — KHÔNG lộ email
        const signInRes = await fetch("/api/auth/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmedUsername, password })
        });

        if (!signInRes.ok) {
          const payload = await signInRes.json().catch(() => ({}));
          throw new Error(payload.error || "Invalid username or password.");
        }

        const { session } = await signInRes.json();
        if (!session) {
          throw new Error("Unable to sign in.");
        }

        // Set session vào Supabase client
        const { error: setError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        if (setError) throw setError;

        const { data: { user: signedInUser } } = await supabase.auth.getUser();
        if (!signedInUser) {
          throw new Error("Unable to retrieve user.");
        }
        onAuthenticated(signedInUser);
      }
    } catch (authError) {
      setError(authError.message || "Unable to authenticate. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
    const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { display_name: displayName },
    captchaToken
  }
});
  };

  return (
    <div
      className="auth-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="auth-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          className="auth-close"
          type="button"
          aria-label="Close sign in"
          onClick={onClose}
        >
          ×
        </button>
        <span className="welcome-eyebrow">WELCOME TO AFTERCODE</span>
        <h2 id="auth-title">{mode === "sign-in" ? "Sign in to your account" : "Create your account"}</h2>
        <p className="auth-intro">
          {mode === "sign-in"
            ? "Sign in to save projects and join the community."
            : "Create an account to start sharing your projects."}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            onClick={() => changeMode("sign-in")}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-up"}
            onClick={() => changeMode("sign-up")}
          >
            Create Account
          </button>
          <HCaptcha
            sitekey="3052ee80-e7ac-4b88-a35e-f64ca4fe8bc8"
            onVerify={setCaptchaToken}
          />
        </div>

        {!isSupabaseConfigured && (
          <p className="auth-notice" role="status">
            Email sign-in is not configured yet. Set <code>VITE_SUPABASE_URL</code> and
            <code> VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart the dev server.
          </p>
        )}

        {message && <p className="auth-success" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "sign-up" && (
            <label>
              Display name
              <input
                autoComplete="username"
                maxLength={40}
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}

          {mode === "sign-in" ? (
            <label>
              Username
              <input
                autoComplete="username"
                maxLength={40}
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your-username"
              />
            </label>
          ) : (
            <label>
              Email
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}

          <label>
            Password
            <input
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button
            className="signin-btn auth-submit"
            type="submit"
            disabled={!isSupabaseConfigured || isSubmitting}
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "sign-in" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </section>
    </div>
  );
}