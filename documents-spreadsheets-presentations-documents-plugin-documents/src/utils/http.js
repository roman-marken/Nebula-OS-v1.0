import { readFile } from "node:fs/promises";
import path from "node:path";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length > 64_000) throw httpError(413, "ERR_PAYLOAD_TOO_LARGE", "Запрос слишком большой");
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "ERR_BAD_JSON", "Некорректный JSON");
  }
}

export function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

export function httpError(status, code, message, details = undefined) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

export function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, idx)), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

export function setAuthCookie(token, secure = false) {
  const flags = ["Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=900"];
  if (secure) flags.push("Secure");
  return `bunker_token=${encodeURIComponent(token)}; ${flags.join("; ")}`;
}

export function clearAuthCookie() {
  return "bunker_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export async function serveStatic(req, res, publicDir) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const normalized = path.normalize(pathname === "/" ? "/index.html" : pathname);
  if (normalized.includes("..")) return false;
  const filePath = path.join(publicDir, normalized);
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": normalized.endsWith(".html") ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
    return true;
  } catch {
    if (!path.extname(normalized)) {
      const data = await readFile(path.join(publicDir, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(data);
      return true;
    }
    return false;
  }
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

