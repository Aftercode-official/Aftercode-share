export function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function requireMethod(req, res, allowedMethods) {
  if (allowedMethods.includes(req.method)) {
    return true;
  }

  res.setHeader("Allow", allowedMethods.join(", "));
  sendJson(res, 405, { error: "Method not allowed." });
  return false;
}

export function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      const body = JSON.parse(req.body);
      return body && typeof body === "object" && !Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function logApiError(context, error) {
  console.error(`[api] ${context}`, error);
}
