import crypto from "node:crypto";
import { parseCookies } from "../utils/http.js";
import { verifyToken } from "../security/auth.js";

const guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class WebSocketHub {
  constructor({ server, store, game }) {
    this.clients = new Set();
    this.store = store;
    this.game = game;
    server.on("upgrade", (req, socket) => this.handleUpgrade(req, socket));
    game.onRoomUpdate = (room, extra) => this.broadcastRoom(room, extra);
  }

  handleUpgrade(req, socket) {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }
      const cookies = parseCookies(req.headers.cookie || "");
      const session = verifyToken(cookies.bunker_token);
      const user = this.store.getUserById(session.sub);
      if (!user) throw new Error("user not found");
      const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + guid).digest("base64");
      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${accept}`,
          "\r\n"
        ].join("\r\n")
      );
      const client = { socket, user, roomCode: url.searchParams.get("room")?.toUpperCase() || null, alive: true };
      this.clients.add(client);
      socket.on("data", (data) => this.handleFrame(client, data));
      socket.on("close", () => this.disconnect(client));
      socket.on("error", () => this.disconnect(client));
      this.send(client, { event: "connected", user: this.store.publicUser(user) });
      if (client.roomCode) {
        try {
          const room = this.game.getRoom(client.roomCode);
          this.send(client, { event: "room_state", room: this.game.privateRoomFor(room, user.id) });
        } catch {
          this.send(client, { event: "error", code: "ERR_ROOM_NOT_FOUND", message: "Комната не найдена" });
        }
      }
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  }

  handleFrame(client, data) {
    const messages = decodeFrames(data);
    for (const message of messages) {
      try {
        const payload = JSON.parse(message);
        this.route(client, payload);
      } catch (error) {
        this.send(client, { event: "error", code: error.code || "ERR_WS", message: error.message || "Ошибка WebSocket" });
      }
    }
  }

  route(client, payload) {
    const roomCode = String(payload.roomCode || client.roomCode || "").toUpperCase();
    if (payload.event === "join_room") {
      client.roomCode = roomCode;
      const room = this.game.getRoom(roomCode);
      this.send(client, { event: "room_state", room: this.game.privateRoomFor(room, client.user.id) });
      return;
    }
    if (!roomCode) throw new Error("roomCode required");
    if (payload.event === "raise_hand") this.game.raiseHand(client.user, roomCode);
    if (payload.event === "reveal") this.game.reveal(client.user, roomCode, payload.key);
    if (payload.event === "start_vote") this.game.startVote(client.user, roomCode);
    if (payload.event === "vote") this.game.vote(client.user, roomCode, payload.decision);
    if (payload.event === "trade_offer") this.game.trade(client.user, roomCode, payload.targetId);
    if (payload.event === "trade_answer") this.game.acceptTrade(client.user, roomCode, payload.tradeId, payload.accept);
  }

  broadcastRoom(room, extra = null) {
    for (const client of this.clients) {
      if (client.roomCode !== room.code) continue;
      this.send(client, { event: "room_state", room: this.game.privateRoomFor(room, client.user.id) });
      if (extra) this.send(client, extra);
    }
    this.broadcastLobby();
  }

  broadcastLobby() {
    const payload = { event: "rooms_update", rooms: this.game.listRooms() };
    for (const client of this.clients) this.send(client, payload);
  }

  send(client, payload) {
    if (client.socket.destroyed) return;
    client.socket.write(encodeFrame(JSON.stringify(payload)));
  }

  disconnect(client) {
    this.clients.delete(client);
    if (!client.roomCode) return;
    try {
      const room = this.game.getRoom(client.roomCode);
      const player = room.players.find((candidate) => candidate.userId === client.user.id);
      if (player) {
        player.isConnected = false;
        this.game.emit(room, { event: "toast", tone: "pink", message: `${player.nickname} потерял соединение. Ждём переподключения.` });
      }
    } catch {
      // Ignore disconnects for stale rooms.
    }
  }
}

function encodeFrame(message) {
  const payload = Buffer.from(message);
  const header = [];
  header.push(0x81);
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 255, payload.length & 255);
  } else {
    header.push(127, 0, 0, 0, 0, (payload.length >> 24) & 255, (payload.length >> 16) & 255, (payload.length >> 8) & 255, payload.length & 255);
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const opcode = first & 0x0f;
    const second = buffer[offset++];
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    if (length === 126) {
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      const high = buffer.readUInt32BE(offset);
      const low = buffer.readUInt32BE(offset + 4);
      offset += 8;
      length = high * 2 ** 32 + low;
    }
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    if (masked) offset += 4;
    const payload = buffer.subarray(offset, offset + length);
    offset += length;
    if (opcode === 8) break;
    if (opcode !== 1) continue;
    if (masked) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i += 1) unmasked[i] = payload[i] ^ mask[i % 4];
      messages.push(unmasked.toString("utf8"));
    } else {
      messages.push(payload.toString("utf8"));
    }
  }
  return messages;
}

