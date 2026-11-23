import LogoIcon from "./assets/Logo.png";
import "./NotFoundPage.css";

export default function NotFoundPage({ searchQuery, onSearchQueryChange, onSearchSubmit }) {
  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <img className="not-found-logo" src={LogoIcon} alt="Aftercode" width="180" height="59" draggable={false} />
        <div className="not-found-search-wrap">
          <input
            type="text"
            className="not-found-search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit();
            }}
          />
        </div>
        <h1 className="not-found-title">Page not found</h1>
        <p className="not-found-description">
          Looks like the page you are looking for doesn't exsits,<br />
          how about search something else?
        </p>
      </div>
    </div>
  );
}
