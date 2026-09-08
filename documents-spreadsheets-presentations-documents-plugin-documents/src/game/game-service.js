import crypto from "node:crypto";
import { config } from "../config.js";
import { catastrophes, characters, genders, healthNotes, items, phobias, professions, roleDialogues, secrets } from "./content.js";
import { httpError } from "../utils/http.js";

const botNames = ["NeonDoc", "RustPilot", "ZeroFox", "MiraByte", "OldReactor", "KiraAsh"];
const revealableKeys = ["gender", "profession", "character", "health", "item", "phobia", "secret", "age"];

export class GameService {
  constructor(store) {
    this.store = store;
    this.rooms = new Map();
    this.actionLog = new Map();
    this.onRoomUpdate = () => {};
  }

  listRooms() {
    return [...this.rooms.values()].map((room) => this.publicRoom(room));
  }

  createRoom(user, { name, isPrivate = false, maxPlayers = 6, fillBots = false }) {
    const max = Number(maxPlayers);
    if (![4, 6, 8].includes(max)) throw httpError(400, "ERR_BAD_MAX_PLAYERS", "Максимум игроков: 4, 6 или 8");
    const room = {
      id: crypto.randomUUID(),
      code: createRoomCode(),
      name: cleanRoomName(name),
      isPrivate: Boolean(isPrivate),
      inviteCode: createInviteCode(),
      hostId: user.id,
      maxPlayers: max,
      status: "waiting",
      players: [],
      spectators: [],
      catastrophe: pick(catastrophes),
      currentTurnPlayerId: null,
      phase: "waiting",
      phaseEndsAt: null,
      round: 0,
      votes: {},
      trades: [],
      winnerIds: [],
      createdAt: new Date().toISOString()
    };
    this.addPlayer(room, user);
    if (fillBots) this.fillWithBots(room, Math.max(4, Math.min(max, 6)) - 1);
    this.rooms.set(room.code, room);
    this.audit("game_create", user.id, { roomCode: room.code, private: room.isPrivate });
    this.emit(room);
    return this.privateRoomFor(room, user.id);
  }

  joinRoom(user, { roomCode, inviteCode }) {
    const room = this.getRoom(roomCode);
    if (room.status !== "waiting") throw httpError(409, "ERR_GAME_ALREADY_STARTED", "Игра уже началась");
    if (room.players.length >= room.maxPlayers) throw httpError(409, "ERR_ROOM_FULL", "В комнате нет мест");
    if (room.isPrivate && inviteCode !== room.inviteCode) throw httpError(403, "ERR_ACCESS_DENIED", "Доступ запрещен. Только по приглашению.");
    if (!room.players.some((player) => player.userId === user.id)) this.addPlayer(room, user);
    this.audit("room_join", user.id, { roomCode: room.code });
    this.emit(room);
    return this.privateRoomFor(room, user.id);
  }

  setReady(user, roomCode, ready) {
    const room = this.getRoom(roomCode);
    const player = this.requirePlayer(room, user.id);
    player.ready = Boolean(ready);
    this.audit("player_ready", user.id, { roomCode, ready: player.ready });
    this.emit(room);
    return this.privateRoomFor(room, user.id);
  }

  startGame(user, roomCode) {
    const room = this.getRoom(roomCode);
    if (room.hostId !== user.id) throw httpError(403, "ERR_HOST_ONLY", "Только хост может начать игру");
    if (room.players.length < 4) throw httpError(409, "ERR_NOT_ENOUGH_PLAYERS", "Нужно минимум 4 игрока");
    room.status = "in_progress";
    room.phase = "discussion";
    room.round = 1;
    room.votes = {};
    room.trades = [];
    room.players.forEach((player) => {
      player.ready = true;
      player.isAlive = true;
      player.isConnected = true;
      player.character = generateCharacter();
      player.revealed = ["profession"];
      player.voteLocked = false;
    });
    room.currentTurnPlayerId = (room.players.find((player) => player.userId === user.id && player.isAlive) || pick(room.players.filter((player) => player.isAlive))).userId;
    room.phaseEndsAt = Date.now() + config.turnSeconds * 1000;
    this.audit("game_start", user.id, { roomCode, playersCount: room.players.length });
    this.emit(room);
    return this.privateRoomFor(room, user.id);
  }

  reveal(user, roomCode, key) {
    const room = this.getRoom(roomCode);
    this.ensurePhase(room, "discussion");
    const player = this.requirePlayer(room, user.id);
    if (room.currentTurnPlayerId !== user.id) throw httpError(403, "ERR_NOT_ACTIVE_PLAYER", "Сейчас не ваш ход");
    if (!revealableKeys.includes(key)) throw httpError(400, "ERR_BAD_CHARACTER_KEY", "Такую характеристику раскрыть нельзя");
    if (!player.revealed.includes(key)) player.revealed.push(key);
    this.audit("card_reveal", user.id, { roomCode, key });
    this.emit(room, { event: "toast", tone: "cyan", message: `${player.nickname} раскрыл: ${labelFor(key)} - ${player.character[key]}` });
    return this.privateRoomFor(room, user.id);
  }

  raiseHand(user, roomCode) {
    const room = this.getRoom(roomCode);
    const player = this.requirePlayer(room, user.id);
    player.handRaised = !player.handRaised;
    this.audit("raise_hand", user.id, { roomCode, raised: player.handRaised });
    this.emit(room);
  }

  startVote(user, roomCode) {
    const room = this.getRoom(roomCode);
    if (room.currentTurnPlayerId !== user.id && room.hostId !== user.id) throw httpError(403, "ERR_NOT_ALLOWED", "Голосование запускает активный игрок или хост");
    room.phase = "voting";
    room.votes = {};
    room.phaseEndsAt = Date.now() + config.voteSeconds * 1000;
    this.audit("vote_start", user.id, { roomCode, target: room.currentTurnPlayerId });
    this.emit(room, { event: "toast", tone: "pink", message: "Голосование началось. Решите судьбу игрока." });
  }

  vote(user, roomCode, decision) {
    const room = this.getRoom(roomCode);
    this.ensurePhase(room, "voting");
    const voter = this.requirePlayer(room, user.id);
    if (!voter.isAlive) throw httpError(403, "ERR_SPECTATOR_ONLY", "Выбывшие игроки не голосуют");
    if (room.currentTurnPlayerId === user.id) throw httpError(403, "ERR_TARGET_CANNOT_VOTE", "Активный игрок не голосует за себя");
    this.guardActionSpeed(user.id, "vote");
    if (!["keep", "kick", "abstain"].includes(decision)) throw httpError(400, "ERR_BAD_VOTE", "Некорректный голос");
    if (room.votes[user.id]) return;
    room.votes[user.id] = decision;
    this.audit("vote_cast", user.id, { roomCode, target: room.currentTurnPlayerId, decision, round: room.round });
    const required = room.players.filter((player) => player.isAlive && player.userId !== room.currentTurnPlayerId && !player.isBot).length;
    const humanVotes = Object.keys(room.votes).filter((id) => !this.requirePlayer(room, id).isBot).length;
    if (humanVotes >= required) {
      this.botVote(room);
      this.finishVote(room);
    }
    this.emit(room);
  }

  trade(user, roomCode, targetId) {
    const room = this.getRoom(roomCode);
    const from = this.requirePlayer(room, user.id);
    const to = this.requirePlayer(room, targetId);
    if (!from.isAlive || !to.isAlive || from.userId === to.userId) throw httpError(400, "ERR_BAD_TRADE", "Обмен невозможен");
    if (room.trades.some((trade) => trade.status === "pending" && (trade.fromId === user.id || trade.toId === user.id || trade.fromId === targetId || trade.toId === targetId))) {
      throw httpError(409, "ERR_TRADE_BUSY", "Игрок уже участвует в обмене");
    }
    const trade = { id: crypto.randomUUID(), fromId: user.id, toId: targetId, item: from.character.item, requested: "голос За", status: "pending", createdAt: Date.now() };
    room.trades.push(trade);
    if (to.isBot) {
      trade.status = Math.random() > 0.35 ? "accepted" : "declined";
      if (trade.status === "accepted") [from.character.item, to.character.item] = [to.character.item, from.character.item];
    }
    this.audit("trade_initiated", user.id, { roomCode, toId: targetId, item: trade.item });
    this.emit(room, { event: "toast", tone: "cyan", message: trade.status === "pending" ? "Обмен предложен." : `Бот ${trade.status === "accepted" ? "принял" : "отклонил"} обмен.` });
  }

  acceptTrade(user, roomCode, tradeId, accept) {
    const room = this.getRoom(roomCode);
    const trade = room.trades.find((item) => item.id === tradeId && item.toId === user.id && item.status === "pending");
    if (!trade) throw httpError(404, "ERR_TRADE_NOT_FOUND", "Обмен не найден");
    trade.status = accept ? "accepted" : "declined";
    if (accept) {
      const from = this.requirePlayer(room, trade.fromId);
      const to = this.requirePlayer(room, trade.toId);
      [from.character.item, to.character.item] = [to.character.item, from.character.item];
    }
    this.audit("trade_resolved", user.id, { roomCode, tradeId, accept });
    this.emit(room);
  }

  myCard(user, roomCode) {
    const room = this.getRoom(roomCode);
    const player = this.requirePlayer(room, user.id);
    return player.character;
  }

  aiAdvice(user, { roomCode, mode }) {
    const room = this.getRoom(roomCode);
    const player = this.requirePlayer(room, user.id);
    const dialogue = roleDialogues[player.character?.profession] || roleDialogues["Охотник"];
    const visibleThreats = room.players
      .filter((candidate) => candidate.isAlive && candidate.userId !== user.id)
      .map((candidate) => candidate.nickname)
      .slice(0, 3)
      .join(", ");
    const answers = {
      strategy: `${dialogue.reveal} Скажите коротко: "${dialogue.open}"`,
      analysis: visibleThreats ? `Следите за ${visibleThreats}. Сильнее всего давите на полезность профессий под катастрофу "${room.catastrophe.title}".` : "Пока недостаточно данных для анализа.",
      fun: "Факт дня: в хорошем бункере важнее не толстые стены, а люди, которые не ломают генератор из-за спора о супе."
    };
    this.audit("ai_request", user.id, { roomCode, mode, success: true });
    return { answer: answers[mode] || answers.strategy };
  }

  tick() {
    for (const room of this.rooms.values()) {
      if (room.status !== "in_progress" || !room.phaseEndsAt || Date.now() < room.phaseEndsAt) continue;
      if (room.phase === "discussion") this.startVote({ id: room.hostId }, room.code);
      else if (room.phase === "voting") {
        this.botVote(room);
        this.finishVote(room);
      }
    }
  }

  getRoom(roomCode) {
    const room = this.rooms.get(String(roomCode || "").toUpperCase());
    if (!room) throw httpError(404, "ERR_ROOM_NOT_FOUND", "Комната не найдена");
    return room;
  }

  publicRoom(room) {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPrivate: room.isPrivate,
      inviteCode: room.inviteCode,
      hostId: room.hostId,
      status: room.status,
      playersCount: room.players.length,
      maxPlayers: room.maxPlayers,
      catastrophe: room.catastrophe,
      phase: room.phase,
      round: room.round
    };
  }

  privateRoomFor(room, userId) {
    return {
      ...this.publicRoom(room),
      currentTurnPlayerId: room.currentTurnPlayerId,
      phaseEndsAt: room.phaseEndsAt,
      votesCount: Object.keys(room.votes).length,
      hostId: room.hostId,
      trades: room.trades.filter((trade) => trade.fromId === userId || trade.toId === userId),
      winnerIds: room.winnerIds,
      players: room.players.map((player) => this.publicPlayer(player, userId))
    };
  }

  publicPlayer(player, viewerId) {
    const isSelf = player.userId === viewerId;
    const character = {};
    if (player.character) {
      const keys = isSelf ? revealableKeys : player.revealed || ["profession"];
      for (const key of keys) character[key] = player.character[key];
    }
    return {
      userId: player.userId,
      nickname: player.nickname,
      avatarColor: player.avatarColor,
      isBot: player.isBot,
      isAlive: player.isAlive,
      isConnected: player.isConnected,
      ready: player.ready,
      handRaised: player.handRaised,
      revealed: player.revealed || [],
      character
    };
  }

  addPlayer(room, user) {
    room.players.push({
      userId: user.id,
      nickname: user.nickname,
      avatarColor: user.avatarColor || "#00F0FF",
      isBot: false,
      isAlive: true,
      isConnected: true,
      ready: false,
      handRaised: false,
      revealed: [],
      character: null
    });
    room.maxPlayers = room.maxPlayers || 6;
  }

  fillWithBots(room, amount) {
    for (let i = 0; i < amount && room.players.length < room.maxPlayers; i += 1) {
      const name = botNames[(room.players.length + i) % botNames.length];
      room.players.push({
        userId: `bot-${crypto.randomUUID()}`,
        nickname: name,
        avatarColor: ["#FF0055", "#00FF88", "#FFD166", "#B967FF"][i % 4],
        isBot: true,
        isAlive: true,
        isConnected: true,
        ready: true,
        handRaised: false,
        revealed: [],
        character: null
      });
    }
  }

  requirePlayer(room, userId) {
    const player = room.players.find((candidate) => candidate.userId === userId);
    if (!player) throw httpError(403, "ERR_NOT_IN_ROOM", "Вы не в этой комнате");
    return player;
  }

  ensurePhase(room, phase) {
    if (room.phase !== phase) throw httpError(409, "ERR_BAD_PHASE", `Сейчас этап: ${room.phase}`);
  }

  finishVote(room) {
    const values = Object.values(room.votes);
    const kick = values.filter((vote) => vote === "kick").length;
    const keep = values.filter((vote) => vote === "keep").length;
    const target = this.requirePlayer(room, room.currentTurnPlayerId);
    if (kick > keep) {
      target.isAlive = false;
      target.revealed = revealableKeys;
    }
    if (room.players.filter((player) => player.isAlive).length <= 2) {
      room.phase = "finished";
      room.status = "finished";
      room.phaseEndsAt = null;
      room.winnerIds = room.players.filter((player) => player.isAlive).map((player) => player.userId);
      this.emit(room, { event: "toast", tone: "green", message: "Бункер закрыт. Финалисты выжили." });
      return;
    }
    room.round += 1;
    room.phase = "discussion";
    room.votes = {};
    room.currentTurnPlayerId = nextAliveAfter(room, target.userId).userId;
    room.phaseEndsAt = Date.now() + config.turnSeconds * 1000;
    this.emit(room, { event: "toast", tone: kick > keep ? "pink" : "green", message: kick > keep ? `${target.nickname} изгнан из бункера.` : `${target.nickname} остаётся в бункере.` });
  }

  botVote(room) {
    for (const player of room.players) {
      if (!player.isBot || !player.isAlive || player.userId === room.currentTurnPlayerId || room.votes[player.userId]) continue;
      room.votes[player.userId] = Math.random() > 0.52 ? "kick" : "keep";
    }
  }

  guardActionSpeed(userId, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const last = this.actionLog.get(key) || 0;
    this.actionLog.set(key, now);
    if (now - last < 200) throw httpError(429, "ERR_ACTION_TOO_FAST", "Действие слишком быстро повторено");
  }

  audit(event, userId, payload) {
    this.store.log(event, { userId, ...payload });
  }

  emit(room, extra = null) {
    this.onRoomUpdate(room, extra);
  }
}

function generateCharacter() {
  const profession = pick(professions);
  const healthScore = randomInt(1, 10);
  return {
    gender: pick(genders),
    profession,
    character: pick(characters),
    health: `${healthScore}/10 - ${pick(healthNotes)}`,
    item: pick(items),
    phobia: pick(phobias),
    secret: pick(secrets),
    age: randomInt(18, 65)
  };
}

function nextAliveAfter(room, userId) {
  const alive = room.players.filter((player) => player.isAlive);
  const currentIndex = room.players.findIndex((player) => player.userId === userId);
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const candidate = room.players[(currentIndex + offset) % room.players.length];
    if (candidate?.isAlive) return candidate;
  }
  return alive[0];
}

function createRoomCode() {
  return `BUNK-${Math.floor(10 + Math.random() * 90)}`;
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function cleanRoomName(name) {
  const value = String(name || "").trim().slice(0, 40);
  return value || "Неоновое убежище";
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function labelFor(key) {
  return {
    gender: "Пол",
    profession: "Профессия",
    character: "Характер",
    health: "Здоровье",
    item: "Груз",
    phobia: "Фобия",
    secret: "Секрет",
    age: "Возраст"
  }[key];
}
