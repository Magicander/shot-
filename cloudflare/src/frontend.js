// Serwowanie tekstowych plików interfejsu z frontend_bundle.js (generuje deploy_cloudflare.py).
// Zdjęcia, kadry, plakaty i dane pakietów zostają w ASSETS.
import { FRONTEND, FRONTEND_ETAG } from "./frontend_bundle.js";

const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
};

// Te ścieżki są tylko szablonami — Worker oddaje je przez / i /admin (z podstawieniem języka).
export const FRONTEND_BLOCKED = new Set(["/static/index.html", "/static/admin.html"]);

export function frontendBody(path) {
  return Object.prototype.hasOwnProperty.call(FRONTEND, path) ? FRONTEND[path] : null;
}

export function frontendType(path) {
  const dot = path.lastIndexOf(".");
  return TYPES[dot >= 0 ? path.slice(dot) : ""] || "application/octet-stream";
}

export function frontendResponse(req, path) {
  if (FRONTEND_BLOCKED.has(path)) return null;
  const body = frontendBody(path);
  if (body == null) return null;
  const etag = FRONTEND_ETAG[path];
  const headers = {
    "Content-Type": frontendType(path),
    "Cache-Control": "no-cache",
  };
  if (etag) {
    headers.ETag = etag;
    const inm = req && req.headers && req.headers.get("If-None-Match");
    if (inm && inm === etag) return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers });
}

export { FRONTEND, FRONTEND_ETAG };
