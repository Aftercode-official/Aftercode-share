import handler from "../_shared/serverless-handlers/dispatcher.js";

const allowedOrigins = new Set([
  "https://aftercode-official.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const responseHeaders = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  });
  if (allowedOrigins.has(origin)) {
    responseHeaders.set("Access-Control-Allow-Origin", origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  const url = new URL(request.url);
  const routePath = url.pathname
    .replace(/^\/functions\/v1\/api(?=\/|$)/, "")
    .replace(/^\/api(?=\/|$)/, "");
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const previous = query[key];
    query[key] = previous === undefined
      ? value
      : Array.isArray(previous) ? [...previous, value] : [previous, value];
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    body = await request.text();
  }

  const req = {
    method: request.method,
    url: `/api${routePath}${url.search}`,
    headers,
    query,
    body,
  };

  let status = 200;
  let responseBody: string | null = null;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    setHeader(name: string, value: string) {
      responseHeaders.set(name, value);
      return this;
    },
    end(value?: string) {
      responseBody = value ?? null;
      return this;
    },
  };

  try {
    await handler(req, res);
  } catch (error) {
    console.error("[api] Unhandled Edge Function error.", error);
    status = 500;
    responseBody = JSON.stringify({ error: "The API is temporarily unavailable." });
    responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  }

  return new Response(responseBody, { status, headers: responseHeaders });
});
