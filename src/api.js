import { supabase } from "./supabase.js";

// Cache promise đang bay để dedupe request trùng
const inflightRequests = new Map();
const INFLIGHT_WINDOW_MS = 300;

function inflightKey(path, method) {
  return `${method} ${path}`;
}

export async function apiRequest(path, { method = "GET", body, authenticated = false } = {}) {
  // Chỉ dedupe GET (không dedupe POST/PUT/DELETE)
  if (method === "GET") {
    const key = inflightKey(path, method);
    const existing = inflightRequests.get(key);
    if (existing && Date.now() - existing.startedAt < INFLIGHT_WINDOW_MS) {
      return existing.promise;
    }
  }

  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (authenticated) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error("Sign in to use this feature.");
    }
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const promise = (async () => {
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      if (response.ok) {
        throw new Error(
          `The API endpoint ${path} did not return JSON. The Vite dev server does not run Vercel Functions; stop it and start the app with "npx vercel dev".`
        );
      }
      throw new Error(`Request to ${path} failed with status ${response.status}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`The API endpoint ${path} returned invalid JSON.`);
    }

    if (!response.ok) {
      if (response.status === 403 && payload?.code === "ACCOUNT_BANNED") {
        await supabase?.auth.signOut({ scope: "local" }).catch(() => {});
        window.dispatchEvent(new CustomEvent("aftercode:account-banned", { detail: { message: payload.error } }));
      }
      throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error(`The API endpoint ${path} returned an invalid response.`);
    }
    return payload;
  })();

  if (method === "GET") {
    const key = inflightKey(path, method);
    inflightRequests.set(key, { promise, startedAt: Date.now() });
    promise.finally(() => {
      setTimeout(() => {
        const current = inflightRequests.get(key);
        if (current && current.promise === promise) {
          inflightRequests.delete(key);
        }
      }, INFLIGHT_WINDOW_MS);
    });
  }

  return promise;
}
