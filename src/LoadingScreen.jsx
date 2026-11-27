import "./LoadingScreen.css";

export default function LoadingScreen({ siteStyle = "brutalist", inline = false, eggTheme = false }) {
  const themeClass = siteStyle === "classic" ? "loading-screen-aero" : "loading-screen-brutalist";
  return (
    <div className={`loading-screen ${themeClass}${inline ? " loading-screen-inline" : ""}${eggTheme ? " loading-screen-egg" : ""}`} role="status" aria-live="polite">
      <img className="loading-center-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Aftercode" />
      <div className="loading-simple-progress" aria-hidden="true"><span /></div>
      <p className="loading-experience">{eggTheme ? "666" : "Loading experience..."}</p>
    </div>
  );
}
