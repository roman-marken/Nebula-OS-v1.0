import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "127.0.0.1",
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex"),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  publicOrigin: process.env.PUBLIC_ORIGIN || "http://localhost:3000",
  dataDir: path.join(rootDir, "data"),
  tokenTtlSeconds: 15 * 60,
  reconnectGraceMs: 15_000,
  turnSeconds: 60,
  voteSeconds: 15
};
