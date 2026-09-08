# API

Base URL: `/api`

Все защищённые маршруты требуют HttpOnly cookie `bunker_token`.

## Auth

### POST `/auth/register`

Request:

```json
{
  "nickname": "CyberHunter",
  "email": "user@example.com",
  "password": "SecurePass123!",
  "captchaToken": "recaptcha-v3-token"
}
```

Response 200:

```json
{
  "user": {
    "id": "uuid",
    "nickname": "CyberHunter",
    "email": "user@example.com",
    "avatarColor": "#00F0FF",
    "totalGames": 0,
    "wins": 0,
    "rating": 1000
  }
}
```

Errors: `ERR_VALIDATION`, `ERR_NICKNAME_EXISTS`, `ERR_EMAIL_EXISTS`.

### POST `/auth/login`

Request:

```json
{
  "login": "CyberHunter",
  "password": "SecurePass123!"
}
```

Errors: `ERR_BAD_CREDENTIALS`, `ERR_RATE_LIMIT`.

### GET `/auth/me`

Returns the current user or `ERR_UNAUTHORIZED` / `ERR_SESSION_EXPIRED`.

### POST `/auth/logout`

Clears the session cookie.

## Users

### GET `/users/check-nickname?nickname=CyberHunter`

Response:

```json
{ "available": true }
```

## Friends

### GET `/friends/list`

Response:

```json
{
  "friends": [
    { "id": "friend-1", "nickname": "MiraByte", "is_online": true, "game_id": null, "avatarColor": "#00FF88" }
  ]
}
```

### POST `/friends/request`

Request:

```json
{ "target_user_id": "uuid" }
```

Response:

```json
{ "status": "pending" }
```

## Game

### GET `/game/rooms`

Response:

```json
{
  "rooms": [
    {
      "code": "BUNK-42",
      "name": "Неоновое убежище",
      "isPrivate": false,
      "status": "waiting",
      "playersCount": 4,
      "maxPlayers": 6
    }
  ]
}
```

### POST `/game/create`

Request:

```json
{
  "name": "Sector Neon",
  "isPrivate": false,
  "maxPlayers": 6,
  "fillBots": true
}
```

Response:

```json
{ "room": { "code": "BUNK-42", "players": [] } }
```

### POST `/game/join`

Request:

```json
{
  "roomCode": "BUNK-42",
  "inviteCode": "ABC123"
}
```

Errors: `ERR_ROOM_NOT_FOUND`, `ERR_ROOM_FULL`, `ERR_ACCESS_DENIED`, `ERR_GAME_ALREADY_STARTED`.

### POST `/game/ready`

Request:

```json
{ "roomCode": "BUNK-42", "ready": true }
```

### POST `/game/start`

Request:

```json
{ "roomCode": "BUNK-42" }
```

Errors: `ERR_HOST_ONLY`, `ERR_NOT_ENOUGH_PLAYERS`.

### GET `/game/my-card?roomCode=BUNK-42`

Returns all 8 private character attributes for the current player.

## AI

### POST `/ai/ask`

Request:

```json
{
  "roomCode": "BUNK-42",
  "mode": "strategy"
}
```

Response:

```json
{ "answer": "Откройте груз: он усиливает вашу позицию." }
```

## WebSocket

Connect: `/ws?room=BUNK-42`

Client events:

```json
{ "event": "join_room", "roomCode": "BUNK-42" }
{ "event": "raise_hand", "roomCode": "BUNK-42" }
{ "event": "reveal", "roomCode": "BUNK-42", "key": "item" }
{ "event": "start_vote", "roomCode": "BUNK-42" }
{ "event": "vote", "roomCode": "BUNK-42", "decision": "kick" }
{ "event": "trade_offer", "roomCode": "BUNK-42", "targetId": "uuid" }
{ "event": "trade_answer", "roomCode": "BUNK-42", "tradeId": "uuid", "accept": true }
```

Server events:

```json
{ "event": "room_state", "room": {} }
{ "event": "rooms_update", "rooms": [] }
{ "event": "toast", "tone": "cyan", "message": "..." }
{ "event": "error", "code": "ERR_BAD_PHASE", "message": "..." }
```

