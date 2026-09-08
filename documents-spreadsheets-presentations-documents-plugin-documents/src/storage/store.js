import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, "db.json");
    this.users = new Map();
    this.friendRequests = [];
    this.audit = [];
  }

  async load() {
    try {
      if (!existsSync(this.filePath)) {
        await this.seed();
        return;
      }
      const db = JSON.parse(readFileSync(this.filePath, "utf8"));
      for (const user of db.users || []) this.users.set(user.id, user);
      this.friendRequests = db.friendRequests || [];
      this.audit = db.audit || [];
    } catch {
      await this.seed();
    }
  }

  async seed() {
    this.friendRequests = [];
    this.audit = [];
  }

  async save() {
    return {
      users: this.users.size,
      friendRequests: this.friendRequests.length,
      audit: this.audit.length
    };
  }

  getUserById(id) {
    return this.users.get(id);
  }

  findUser(login) {
    const value = String(login || "").toLowerCase();
    return [...this.users.values()].find((user) => user.nickname.toLowerCase() === value || user.email.toLowerCase() === value);
  }

  nicknameExists(nickname) {
    const value = String(nickname || "").toLowerCase();
    return [...this.users.values()].some((user) => user.nickname.toLowerCase() === value);
  }

  emailExists(email) {
    const value = String(email || "").toLowerCase();
    return [...this.users.values()].some((user) => user.email.toLowerCase() === value);
  }

  async createUser({ nickname, email, passwordHash }) {
    const user = {
      id: crypto.randomUUID(),
      nickname: String(nickname).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash,
      avatarColor: pickAvatarColor(),
      totalGames: 0,
      wins: 0,
      rating: 1000,
      createdAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    await this.save();
    return user;
  }

  publicUser(user) {
    return {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      avatarColor: user.avatarColor,
      totalGames: user.totalGames,
      wins: user.wins,
      rating: user.rating
    };
  }

  log(event, payload) {
    this.audit.push({ event, payload, timestamp: new Date().toISOString() });
    if (this.audit.length % 10 === 0) this.save().catch(() => {});
  }
}

function pickAvatarColor() {
  const colors = ["#00F0FF", "#FF0055", "#00FF88", "#FFD166", "#B967FF", "#FF8A00"];
  return colors[Math.floor(Math.random() * colors.length)];
}
