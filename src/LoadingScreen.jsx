import "./LoadingScreen.css";

export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <img className="loading-center-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Aftercode" />
      <div className="loading-simple-progress" aria-hidden="true"><span /></div>
      <p className="loading-experience">Loading experience...</p>
    </div>
  );
}
