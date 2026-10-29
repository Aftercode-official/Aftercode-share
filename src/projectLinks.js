export const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getProjectIdFromUrl(value) {
  if (PROJECT_ID_PATTERN.test(value)) return value;
  try {
    const url = new URL(value, window.location.origin);
    const queryId = url.searchParams.get("projectId") || url.searchParams.get("project");
    if (queryId && PROJECT_ID_PATTERN.test(queryId)) return queryId;
    const pathMatch = url.pathname.match(/\/(?:project|projects)\/([0-9a-f-]{36})(?:\/|$)/i);
    return pathMatch && PROJECT_ID_PATTERN.test(pathMatch[1]) ? pathMatch[1] : null;
  } catch {
    return null;
  }
}

export function getProjectIdsFromText(text) {
  const candidates = text.match(/https?:\/\/[^\s<>"']+|\/(?:project|projects)\/[^\s<>"']+|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? [];
  return [...new Set(candidates
    .map((candidate) => candidate.replace(/[),.!?;]+$/, ""))
    .map(getProjectIdFromUrl)
    .filter(Boolean))];
}

export function projectShareUrl(projectId) {
  const url = new URL(window.location.origin);
  url.searchParams.set("projectId", projectId);
  return url.toString();
}
