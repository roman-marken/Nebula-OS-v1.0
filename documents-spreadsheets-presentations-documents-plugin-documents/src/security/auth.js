import crypto from "node:crypto";
import { config } from "../config.js";
import { httpError, parseCookies } from "../utils/http.js";

const nicknameRegex = /^[a-zA-Zа-яА-Я0-9_]{3,16}$/u;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function validateRegistration({ nickname, email, password }) {
  const errors = {};
  if (!nicknameRegex.test(String(nickname || ""))) errors.nickname = "Никнейм: 3-16 символов, буквы/цифры/_";
  if (!emailRegex.test(String(email || ""))) errors.email = "Некорректный email";
  if (!passwordRegex.test(String(password || ""))) errors.password = "Пароль: минимум 8 символов, 1 цифра и 1 спецсимвол";
  if (Object.keys(errors).length) throw httpError(400, "ERR_VALIDATION", "Проверьте поля регистрации", errors);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `scrypt$${salt}$${hash}`;
}

export async function verifyPassword(password, storedHash) {
  const [kind, salt, hash] = String(storedHash || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const candidate = await scrypt(password, salt);
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex"));
    });
  });
}

export function signToken(user) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: user.id,
      nickname: user.nickname,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + config.tokenTtlSeconds
    })
  );
  const signature = sign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token) {
  const [header, payload, signature] = String(token || "").split(".");
  if (!header || !payload || !signature) throw httpError(401, "ERR_UNAUTHORIZED", "Сессия не найдена");
  const expected = sign(`${header}.${payload}`);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw httpError(401, "ERR_UNAUTHORIZED", "Неверная подпись сессии");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (parsed.exp < Math.floor(Date.now() / 1000)) throw httpError(401, "ERR_SESSION_EXPIRED", "Сессия истекла");
  return parsed;
}

export function authFromRequest(req, store) {
  const cookies = parseCookies(req.headers.cookie || "");
  const session = verifyToken(cookies.bunker_token);
  const user = store.getUserById(session.sub);
  if (!user) throw httpError(401, "ERR_UNAUTHORIZED", "Пользователь не найден");
  return user;
}

function sign(value) {
  return crypto.createHmac("sha256", config.jwtSecret).update(value).digest("base64url");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

