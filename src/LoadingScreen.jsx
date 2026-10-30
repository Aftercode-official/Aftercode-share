import "./LoadingScreen.css";

export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <h1 className="loading-title">Aftercode</h1>
      <p className="loading-text">Loading your projects and updates...</p>
    </div>
  );
}
