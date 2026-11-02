import "./LoadingScreen.css";

export default function LoadingScreen() {
  const style = window.localStorage.getItem("aftercode-share-site-style") === "classic"
    ? "classic"
    : "current";

  return (
    <div className={`loading-screen loading-screen-${style}`} role="status" aria-live="polite">
      <img className="loading-center-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Aftercode" />
      <div className="loading-simple-progress" aria-hidden="true"><span /></div>
      <p className="loading-experience">Loading experience...</p>
    </div>
  );
}
