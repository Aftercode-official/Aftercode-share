import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabase.js";
import { apiRequest } from "./api.js";
import "./AuthModal.css";
import HCaptcha from "@hcaptcha/react-hcaptcha";

export default function AuthModal({ onClose, onAuthenticated, initialMode = "sign-in" }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef(null);

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
    setCaptchaToken("");
    if (captchaRef.current) captchaRef.current.resetCaptcha();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (mode !== "reset-password" && !captchaToken) {
      setError("Please complete the captcha.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "forgot-password") {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) throw new Error("Enter your account email.");
        const redirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
        redirectUrl.searchParams.set("passwordReset", "1");
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: redirectUrl.toString(),
          captchaToken
        });
        if (resetError) throw resetError;
        setMessage("Password reset instructions have been sent to your email.");
        setEmail("");
      } else if (mode === "reset-password") {
        if (password.length < 6) throw new Error("Your new password must be at least 6 characters.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        await supabase.auth.signOut();
        setPassword("");
        setConfirmPassword("");
        setMode("sign-in");
        setMessage("Password changed successfully. Please sign in with your new password.");
      } else if (mode === "sign-up") {
        const trimmedName = displayName.trim();
        const trimmedEmail = email.trim();

        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: { display_name: trimmedName },
            captchaToken
          }
        });
        if (authError) throw authError;

        if (data.user) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            await apiRequest("/api/profiles/me", {
              method: "PUT",
              authenticated: true,
              body: {
                displayName: trimmedName,
                username: trimmedName
              }
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

        const { session } = await apiRequest("/api/auth/sign-in", {
          method: "POST",
          body: { username: trimmedUsername, password }
        });
        if (!session) {
          throw new Error("Unable to sign in.");
        }

        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        if (setSessionError) throw setSessionError;

        const { data: { user: signedInUser } } = await supabase.auth.getUser();
        if (!signedInUser) {
          throw new Error("Unable to retrieve user.");
        }
        onAuthenticated(signedInUser);
      }
    } catch (authError) {
      setError(authError.message || "Unable to authenticate. Please try again.");
      if (captchaRef.current) captchaRef.current.resetCaptcha();
      setCaptchaToken("");
    } finally {
      setIsSubmitting(false);
    }
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
        <h2 id="auth-title">
          {mode === "sign-in" ? "Sign in to your account"
            : mode === "sign-up" ? "Create your account"
            : mode === "forgot-password" ? "Reset your password"
            : "Choose a new password"}
        </h2>
        <p className="auth-intro">
          {mode === "sign-in"
            ? "Sign in to save projects and join the community."
            : mode === "sign-up"
              ? "Create an account to start sharing your projects."
              : mode === "forgot-password"
                ? "Enter the email address used for your account."
                : "Enter and confirm your new password."}
        </p>

        {(mode === "sign-in" || mode === "sign-up") && (
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
          </div>
        )}

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
          ) : (mode === "sign-up" || mode === "forgot-password") ? (
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
          ) : null}

          {(mode === "sign-in" || mode === "sign-up" || mode === "reset-password") && (
            <label>
              {mode === "reset-password" ? "New password" : "Password"}
              <input
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                type="password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}

          {mode === "reset-password" && (
            <label>
              Confirm new password
              <input
                autoComplete="new-password"
                type="password"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}

          {mode === "sign-in" && (
            <button className="auth-forgot-link" type="button" onClick={() => changeMode("forgot-password")}>
              Forgot password?
            </button>
          )}

          {mode !== "reset-password" && (
            <div className="auth-captcha">
              <HCaptcha
                ref={captchaRef}
                sitekey="3052ee80-e7ac-4b88-a35e-f64ca4fe8bc8"
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken("")}
                onError={() => setCaptchaToken("")}
              />
            </div>
          )}

          <button
            className="signin-btn auth-submit"
            type="submit"
            disabled={!isSupabaseConfigured || isSubmitting || (mode !== "reset-password" && !captchaToken)}
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "sign-in" ? "Sign In"
                : mode === "sign-up" ? "Create Account"
                  : mode === "forgot-password" ? "Send reset email"
                    : "Change password"}
          </button>

          {(mode === "forgot-password" || mode === "reset-password") && (
            <button className="auth-back-link" type="button" onClick={() => changeMode("sign-in")}>
              Back to sign in
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
