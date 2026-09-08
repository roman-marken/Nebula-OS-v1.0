import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { GameService } from "./game/game-service.js";
import { WebSocketHub } from "./realtime/ws-server.js";
import { hashPassword, authFromRequest, signToken, validateRegistration, verifyPassword } from "./security/auth.js";
import { RateLimiter } from "./security/rate-limit.js";
import { Store } from "./storage/store.js";
import { clearAuthCookie, clientIp, httpError, readJsonBody, sendJson, serveStatic, setAuthCookie } from "./utils/http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const store = new Store(config.dataDir);
await store.load();

const game = new GameService(store);
const loginLimiter = new RateLimiter(5, 10_000);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, config.publicOrigin);
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");

    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    const served = await serveStatic(req, res, publicDir);
    if (!served) sendJson(res, 404, { error: "ERR_NOT_FOUND", message: "Ресурс не найден" });
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, {
      error: error.code || "ERR_INTERNAL",
      message: status === 500 ? "Внутренняя ошибка сервера" : error.message,
      details: error.details
    });
    if (status >= 500) console.error(error);
  }
});

new WebSocketHub({ server, store, game });
setInterval(() => game.tick(), 1000).unref();

server.listen(config.port, config.host, () => {
  console.log(`BUNKER 2026 is running: http://${config.host}:${config.port}`);
});

async function routeApi(req, res, url) {
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "bunker-2026", rooms: game.listRooms().length });
    return;
  }

  if (method === "GET" && url.pathname === "/api/users/check-nickname") {
    const nickname = url.searchParams.get("nickname") || "";
    sendJson(res, 200, { available: nickname.length >= 3 && !store.nicknameExists(nickname) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJsonBody(req);
    validateRegistration(body);
    if (store.nicknameExists(body.nickname)) throw httpError(409, "ERR_NICKNAME_EXISTS", "Никнейм уже занят");
    if (store.emailExists(body.email)) throw httpError(409, "ERR_EMAIL_EXISTS", "Пользователь с таким email уже зарегистрирован");
    if (!body.captchaToken) store.log("captcha_skipped_dev", { ip: clientIp(req) });
    const passwordHash = await hashPassword(body.password);
    const user = await store.createUser({ nickname: body.nickname, email: body.email, passwordHash });
    const token = signToken(user);
    store.log("user_register", { userId: user.id, ip: clientIp(req), userAgent: req.headers["user-agent"] });
    sendJson(res, 200, { user: store.publicUser(user) }, { "set-cookie": setAuthCookie(token, config.cookieSecure) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const limit = loginLimiter.consume(clientIp(req));
    if (!limit.allowed) throw httpError(429, "ERR_RATE_LIMIT", "Слишком много попыток входа", { retryAfterMs: limit.retryAfterMs });
    const body = await readJsonBody(req);
    const user = store.findUser(body.login);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      store.log("login_failed", { ip: clientIp(req), login: body.login });
      throw httpError(401, "ERR_BAD_CREDENTIALS", "Неверный логин или пароль");
    }
    const token = signToken(user);
    store.log("user_login", { userId: user.id, ip: clientIp(req), userAgent: req.headers["user-agent"] });
    sendJson(res, 200, { user: store.publicUser(user) }, { "set-cookie": setAuthCookie(token, config.cookieSecure) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/logout") {
    sendJson(res, 200, { ok: true }, { "set-cookie": clearAuthCookie() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/auth/me") {
    const user = authFromRequest(req, store);
    sendJson(res, 200, { user: store.publicUser(user) });
    return;
  }

  const user = authFromRequest(req, store);

  if (method === "GET" && url.pathname === "/api/friends/list") {
    sendJson(res, 200, {
      friends: [
        { id: "friend-1", nickname: "MiraByte", is_online: true, game_id: null, avatarColor: "#00FF88" },
        { id: "friend-2", nickname: "RustPilot", is_online: true, game_id: null, avatarColor: "#FF0055" },
        { id: "friend-3", nickname: "OldReactor", is_online: false, game_id: null, avatarColor: "#FFD166" }
      ]
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/friends/request") {
    const body = await readJsonBody(req);
    store.friendRequests.push({ fromId: user.id, targetUserId: body.target_user_id, status: "pending", createdAt: new Date().toISOString() });
    await store.save();
    sendJson(res, 200, { status: "pending" });
    return;
  }

  if (method === "GET" && url.pathname === "/api/game/rooms") {
    sendJson(res, 200, { rooms: game.listRooms() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/game/create") {
    const body = await readJsonBody(req);
    const room = game.createRoom(user, body);
    sendJson(res, 200, { room });
    return;
  }

  if (method === "POST" && url.pathname === "/api/game/join") {
    const body = await readJsonBody(req);
    const room = game.joinRoom(user, body);
    sendJson(res, 200, { room });
    return;
  }

  if (method === "POST" && url.pathname === "/api/game/ready") {
    const body = await readJsonBody(req);
    const room = game.setReady(user, body.roomCode, body.ready);
    sendJson(res, 200, { room });
    return;
  }

  if (method === "POST" && url.pathname === "/api/game/start") {
    const body = await readJsonBody(req);
    const room = game.startGame(user, body.roomCode);
    sendJson(res, 200, { room });
    return;
  }

  if (method === "GET" && url.pathname === "/api/game/my-card") {
    const card = game.myCard(user, url.searchParams.get("roomCode"));
    sendJson(res, 200, { card });
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai/ask") {
    const body = await readJsonBody(req);
    const answer = game.aiAdvice(user, body);
    sendJson(res, 200, answer);
    return;
  }

  throw httpError(404, "ERR_NOT_FOUND", "API endpoint не найден");
}
