const state = {
  user: null,
  rooms: [],
  friends: [],
  room: null,
  ws: null,
  view: "auth",
  authMode: "login",
  privateMode: false,
  aiOpen: false,
  aiAnswer: "",
  modal: null,
  toasts: []
};

const app = document.querySelector("#app");
const statLabels = {
  gender: "Пол",
  profession: "Профессия",
  character: "Характер",
  health: "Здоровье",
  item: "Груз",
  phobia: "Фобия",
  secret: "Секрет",
  age: "Возраст"
};

initCanvas();
setInterval(renderTimerOnly, 250);
boot();

async function boot() {
  try {
    const me = await api("/api/auth/me");
    state.user = me.user;
    state.view = "lobby";
    await loadLobby();
    connectSocket();
  } catch {
    state.view = "auth";
  }
  render();
}

async function loadLobby() {
  const [rooms, friends] = await Promise.all([api("/api/game/rooms"), api("/api/friends/list").catch(() => ({ friends: [] }))]);
  state.rooms = rooms.rooms;
  state.friends = friends.friends;
}

function render() {
  app.innerHTML = `
    <div class="shell">
      ${renderTopbar()}
      ${state.view === "auth" ? renderAuth() : ""}
      ${state.view === "lobby" ? renderLobby() : ""}
      ${state.view === "game" && state.room ? renderGame() : ""}
    </div>
    ${state.aiOpen && state.room ? renderAiDrawer() : ""}
    ${state.modal ? renderModal() : ""}
    <div class="toast-stack">${state.toasts.map((toast) => `<div class="toast ${toast.tone}">${escapeHtml(toast.message)}</div>`).join("")}</div>
  `;
  bindEvents();
  positionSeats();
  renderTimerOnly();
}

function renderTopbar() {
  const user = state.user;
  return `
    <header class="topbar">
      <div class="brand" role="button" data-action="${user ? "go-lobby" : ""}" tabindex="0">
        <div class="brand-mark"><span></span></div>
        <div class="brand-name">BUNKER 2026</div>
      </div>
      ${user ? `<div class="search"><input class="input" id="searchInput" placeholder="Найти друга или комнату..." /></div>` : ""}
      ${
        user
          ? `<div class="toolbar-user"><div class="avatar" style="background:${user.avatarColor}">${initials(user.nickname)}</div><strong>${escapeHtml(user.nickname)}</strong><button class="btn icon" title="Выйти" data-action="logout">⇥</button></div>`
          : ""
      }
    </header>
  `;
}

function renderAuth() {
  const isLogin = state.authMode === "login";
  return `
    <main class="auth-wrap">
      <section class="panel auth-card">
        <h1 class="title">${isLogin ? "Вход в убежище" : "Регистрация выжившего"}</h1>
        <p class="subtitle">${isLogin ? "Введите доступ, чтобы вернуться в лобби." : "Создайте профиль. Пароль проверяется по правилам безопасности."}</p>
        <form id="authForm">
          ${
            isLogin
              ? `<div class="field"><label>Email или никнейм</label><input class="input" name="login" autocomplete="username" placeholder="CyberHunter" required /></div>`
              : `<div class="field"><label>Nickname</label><input class="input" name="nickname" id="nicknameInput" autocomplete="nickname" placeholder="CyberHunter" minlength="3" maxlength="16" required /><div class="hint" id="nicknameHint"></div></div>
                 <div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="email" placeholder="user@example.com" required /></div>`
          }
          <div class="field"><label>Пароль</label><input class="input" name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder="SecurePass123!" required /></div>
          <button class="btn primary" type="submit">${isLogin ? "ВОЙТИ" : "СОЗДАТЬ АККАУНТ"}</button>
        </form>
        <div class="divider">ИЛИ</div>
        <div class="split">
          <button class="btn" data-action="oauth-demo">Google</button>
          <button class="btn" data-action="oauth-demo">Discord</button>
        </div>
        <p style="text-align:center;color:var(--muted)">
          ${isLogin ? "Нет аккаунта?" : "Уже есть аккаунт?"}
          <button class="link-btn" data-action="toggle-auth">${isLogin ? "Регистрация" : "Войти"}</button>
        </p>
      </section>
    </main>
  `;
}

function renderLobby() {
  return `
    <main class="lobby-layout">
      <aside class="side">
        <section class="panel block">
          <h2 class="title">Друзья онлайн</h2>
          ${state.friends.map(renderFriend).join("") || `<div class="empty">Список друзей пуст</div>`}
        </section>
        <section class="panel block">
          <h2 class="title">Мои достижения</h2>
          <div class="meta"><span class="dot"></span><strong>Побед: ${state.user.wins}</strong><span>Рейтинг: ${state.user.rating}</span></div>
        </section>
      </aside>
      <section>
        <div class="panel block">
          <h1 class="title">Создать бункер</h1>
          <div class="segmented">
            <button class="${!state.privateMode ? "active" : ""}" data-action="privacy" data-private="false">Открытая игра</button>
            <button class="${state.privateMode ? "active" : ""}" data-action="privacy" data-private="true">Только друзья</button>
          </div>
          <form id="createRoomForm">
            <div class="create-grid">
              <div class="field">
                <label>Название комнаты</label>
                <input class="input" name="name" placeholder="Введите код доступа..." maxlength="40" />
              </div>
              <div class="field">
                <label>Максимум игроков</label>
                <select class="select" name="maxPlayers">
                  <option value="4">4 игрока</option>
                  <option value="6" selected>6 игроков</option>
                  <option value="8">8 игроков</option>
                </select>
              </div>
            </div>
            <label class="meta" style="margin: 0 0 14px;"><input type="checkbox" name="fillBots" checked /> Заполнить ботами для демо-партии</label>
            <button class="btn primary" type="submit">СОЗДАТЬ БУНКЕР</button>
          </form>
        </div>
        <div class="room-list" id="roomList">${renderRooms(state.rooms)}</div>
      </section>
    </main>
    <nav class="panel bottom-nav"><button class="active">Лобби</button><button>Друзья</button><button>Рейтинг</button><button>Скины</button></nav>
  `;
}

function renderFriend(friend) {
  return `
    <div class="friend">
      <div class="mini-avatar ${friend.is_online ? "online" : ""}" style="background:${friend.avatarColor}">${initials(friend.nickname)}</div>
      <div><strong>${escapeHtml(friend.nickname)}</strong><div class="hint">${friend.is_online ? "online" : "offline"}</div></div>
      <button class="btn icon" title="Пригласить">＋</button>
    </div>
  `;
}

function renderRooms(rooms) {
  if (!rooms.length) return `<div class="empty">Активных комнат пока нет. Создайте первую.</div>`;
  return rooms.map((room) => `
    <article class="room-card">
      <div>
        <h3 class="room-title">${room.isPrivate ? "Закрытый" : "Открытый"} / ${escapeHtml(room.name)}</h3>
        <div class="meta"><span class="dot"></span><span>${room.status === "waiting" ? "Идет набор" : room.status}</span><span>${room.playersCount}/${room.maxPlayers}</span><span>${escapeHtml(room.catastrophe.title)}</span><span>${room.code}</span></div>
      </div>
      <button class="btn green" data-action="join-room" data-code="${room.code}" ${room.status !== "waiting" ? "disabled" : ""}>ВОЙТИ</button>
    </article>
  `).join("");
}

function renderGame() {
  const room = state.room;
  const me = room.players.find((player) => player.userId === state.user.id);
  const active = room.players.find((player) => player.userId === room.currentTurnPlayerId);
  const isHost = room.hostId === state.user.id;
  const isActive = room.currentTurnPlayerId === state.user.id;
  return `
    <main class="game-layout">
      <section class="panel status-strip">
        <div>
          <h1 class="cat-title">${escapeHtml(room.catastrophe.title)}</h1>
          <div class="meta"><span>Раунд ${room.round || 0}</span><span>${escapeHtml(room.catastrophe.description)}</span>${room.isPrivate ? `<span>Код: ${room.inviteCode}</span>` : ""}</div>
        </div>
        <button class="btn" data-action="go-lobby">Лобби</button>
      </section>
      <section class="table-zone" id="tableZone">
        <div class="table-ring"></div>
        <div class="bunker-core"></div>
        ${room.players.map((player, index) => renderSeat(player, index, room)).join("")}
        <div class="center-panel">
          <div class="timer" id="timer"><span>--</span></div>
          <div class="phase">${phaseLabel(room.phase)}${active ? `<br><span style="color:var(--muted);font-size:12px">Ходит: ${escapeHtml(active.nickname)}</span>` : ""}</div>
          ${renderCenterControls({ room, me, isHost, isActive })}
        </div>
      </section>
    </main>
  `;
}

function renderSeat(player, index, room) {
  const stats = Object.entries(player.character || {}).slice(0, player.userId === state.user.id ? 8 : 3);
  return `
    <article class="seat ${player.userId === state.user.id ? "you" : ""} ${player.userId === room.currentTurnPlayerId ? "active" : ""} ${!player.isAlive ? "dead" : ""}" data-seat="${index}">
      <div class="seat-avatar" style="background:${player.avatarColor}">${initials(player.nickname)}</div>
      <div>
        <div class="seat-name">${escapeHtml(player.nickname)} ${player.handRaised ? "✋" : ""}</div>
        <div class="seat-job">${escapeHtml(player.character?.profession || "Скрыто")}</div>
      </div>
      <div class="seat-tags">${stats.map(([key, value]) => `<div class="tag" title="${escapeHtml(String(value))}">${statLabels[key]}: ${escapeHtml(String(value))}</div>`).join("")}</div>
    </article>
  `;
}

function renderCenterControls({ room, me, isHost, isActive }) {
  if (room.status === "waiting") {
    const allReady = room.players.filter((player) => !player.isBot && player.userId !== room.hostId).every((player) => player.ready);
    return `
      <button class="btn green" data-action="ready">${me?.ready ? "ГОТОВ" : "ГОТОВ?"}</button>
      <button class="btn primary" data-action="start-game" ${!isHost || room.players.length < 4 || (!allReady && room.players.length > 1) ? "disabled" : ""}>НАЧАТЬ ИГРУ</button>
    `;
  }
  if (room.status === "finished") {
    return `<button class="btn primary" data-action="show-card">ИТОГИ ПАРТИИ</button>`;
  }
  if (room.phase === "discussion") {
    return `
      ${isActive ? `<button class="btn primary" data-action="open-reveal">РАСКРЫТЬ КАРТУ</button><button class="btn pink" data-action="start-vote">ЗАПУСТИТЬ ГОЛОСОВАНИЕ</button>` : ""}
      <button class="btn" data-action="raise-hand">ПОДНЯТЬ РУКУ</button>
      <button class="btn" data-action="show-card">ОТКРЫТЬ КАРТУ</button>
      <button class="btn" data-action="toggle-ai">ИИ-ПОМОЩНИК</button>
    `;
  }
  if (room.phase === "voting") {
    return `
      <div class="vote-row">
        <button class="btn green" data-action="vote" data-decision="keep" ${isActive ? "disabled" : ""}>✓</button>
        <button class="btn pink" data-action="vote" data-decision="kick" ${isActive ? "disabled" : ""}>×</button>
        <button class="btn" data-action="vote" data-decision="abstain" ${isActive ? "disabled" : ""}>−</button>
      </div>
    `;
  }
  return "";
}

function renderAiDrawer() {
  return `
    <aside class="panel drawer">
      <div class="meta" style="justify-content:space-between"><strong>ИИ-модератор</strong><button class="btn icon" data-action="toggle-ai">×</button></div>
      <div class="split">
        <button class="btn" data-action="ask-ai" data-mode="strategy">Стратегия</button>
        <button class="btn" data-action="ask-ai" data-mode="analysis">Анализ</button>
      </div>
      <button class="btn" data-action="ask-ai" data-mode="fun">Развлечение</button>
      <div class="stat-card">${escapeHtml(state.aiAnswer || "Выберите режим. Ответ придёт через сервер, API-ключи не попадают в браузер.")}</div>
    </aside>
  `;
}

function renderModal() {
  if (state.modal === "card") {
    const me = state.room.players.find((player) => player.userId === state.user.id);
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <section class="panel modal" data-stop>
          <div class="meta" style="justify-content:space-between"><h2 class="title">Моя карта</h2><button class="btn icon" data-action="close-modal">×</button></div>
          <div class="card-grid">${Object.entries(me.character || {}).map(([key, value]) => `<div class="stat-card"><strong>${statLabels[key]}</strong>${escapeHtml(String(value))}</div>`).join("")}</div>
          <h3 class="title" style="margin-top:18px">Обмен</h3>
          <div class="card-grid">${state.room.players.filter((player) => player.userId !== state.user.id && player.isAlive).map((player) => `<button class="btn" data-action="trade" data-target="${player.userId}">${escapeHtml(player.nickname)}</button>`).join("") || `<div class="empty">Нет целей</div>`}</div>
          ${renderTrades()}
        </section>
      </div>
    `;
  }
  if (state.modal === "reveal") {
    const me = state.room.players.find((player) => player.userId === state.user.id);
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <section class="panel modal" data-stop>
          <div class="meta" style="justify-content:space-between"><h2 class="title">Раскрыть характеристику</h2><button class="btn icon" data-action="close-modal">×</button></div>
          <div class="card-grid">${Object.entries(me.character || {}).map(([key, value]) => `<button class="stat-card" data-action="reveal" data-key="${key}" ${me.revealed.includes(key) ? "disabled" : ""}><strong>${statLabels[key]}</strong>${escapeHtml(String(value))}</button>`).join("")}</div>
        </section>
      </div>
    `;
  }
  return "";
}

function renderTrades() {
  const trades = state.room.trades || [];
  if (!trades.length) return "";
  return `<h3 class="title" style="margin-top:18px">Сделки</h3>${trades.map((trade) => `
    <div class="stat-card">
      <strong>${trade.status}</strong>${escapeHtml(trade.item)} за ${escapeHtml(trade.requested)}
      ${trade.toId === state.user.id && trade.status === "pending" ? `<div class="split" style="margin-top:10px"><button class="btn green" data-action="trade-answer" data-id="${trade.id}" data-accept="true">Принять</button><button class="btn pink" data-action="trade-answer" data-id="${trade.id}" data-accept="false">Отклонить</button></div>` : ""}
    </div>
  `).join("")}`;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", (event) => {
      const action = node.dataset.action;
      if (node.dataset.stop !== undefined) event.stopPropagation();
      handleAction(action, node, event).catch((error) => toast(error.message || "Ошибка", "pink"));
    });
  });

  document.querySelectorAll("[data-stop]").forEach((node) => node.addEventListener("click", (event) => event.stopPropagation()));

  const authForm = document.querySelector("#authForm");
  if (authForm) authForm.addEventListener("submit", onAuthSubmit);

  const createRoomForm = document.querySelector("#createRoomForm");
  if (createRoomForm) createRoomForm.addEventListener("submit", onCreateRoom);

  const nicknameInput = document.querySelector("#nicknameInput");
  if (nicknameInput) nicknameInput.addEventListener("input", debounce(checkNickname, 250));

  const search = document.querySelector("#searchInput");
  if (search) search.addEventListener("input", () => {
    const value = search.value.toLowerCase();
    document.querySelector("#roomList").innerHTML = renderRooms(state.rooms.filter((room) => `${room.name} ${room.code}`.toLowerCase().includes(value)));
  });
}

async function handleAction(action, node) {
  if (action === "toggle-auth") {
    state.authMode = state.authMode === "login" ? "register" : "login";
    render();
  }
  if (action === "oauth-demo") toast("OAuth подключается через backend-провайдеры. В демо используйте email/пароль.", "cyan");
  if (action === "logout") {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    state.room = null;
    state.view = "auth";
    state.ws?.close();
    render();
  }
  if (action === "privacy") {
    state.privateMode = node.dataset.private === "true";
    render();
  }
  if (action === "join-room") joinRoom(node.dataset.code);
  if (action === "go-lobby") {
    state.view = "lobby";
    state.room = null;
    await loadLobby();
    connectSocket();
    render();
  }
  if (action === "ready") {
    const next = !state.room.players.find((player) => player.userId === state.user.id).ready;
    const result = await api("/api/game/ready", { method: "POST", body: { roomCode: state.room.code, ready: next } });
    state.room = result.room;
    render();
  }
  if (action === "start-game") {
    const result = await api("/api/game/start", { method: "POST", body: { roomCode: state.room.code } });
    state.room = result.room;
    render();
  }
  if (action === "raise-hand") sendWs({ event: "raise_hand", roomCode: state.room.code });
  if (action === "show-card") {
    state.modal = "card";
    render();
  }
  if (action === "open-reveal") {
    state.modal = "reveal";
    render();
  }
  if (action === "reveal") {
    sendWs({ event: "reveal", roomCode: state.room.code, key: node.dataset.key });
    state.modal = null;
  }
  if (action === "start-vote") sendWs({ event: "start_vote", roomCode: state.room.code });
  if (action === "vote") sendWs({ event: "vote", roomCode: state.room.code, decision: node.dataset.decision });
  if (action === "toggle-ai") {
    state.aiOpen = !state.aiOpen;
    render();
  }
  if (action === "ask-ai") {
    const result = await api("/api/ai/ask", { method: "POST", body: { roomCode: state.room.code, mode: node.dataset.mode } });
    state.aiAnswer = result.answer;
    render();
  }
  if (action === "trade") {
    sendWs({ event: "trade_offer", roomCode: state.room.code, targetId: node.dataset.target });
    state.modal = null;
  }
  if (action === "trade-answer") {
    sendWs({ event: "trade_answer", roomCode: state.room.code, tradeId: node.dataset.id, accept: node.dataset.accept === "true" });
    state.modal = null;
  }
  if (action === "close-modal") {
    state.modal = null;
    render();
  }
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
  if (state.authMode === "register") body.captchaToken = "dev-captcha-placeholder";
  const result = await api(endpoint, { method: "POST", body });
  state.user = result.user;
  state.view = "lobby";
  await loadLobby();
  connectSocket();
  render();
}

async function onCreateRoom(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.maxPlayers = Number(body.maxPlayers);
  body.isPrivate = state.privateMode;
  body.fillBots = body.fillBots === "on";
  const result = await api("/api/game/create", { method: "POST", body });
  state.room = result.room;
  state.view = "game";
  connectSocket(state.room.code);
  render();
}

async function joinRoom(code) {
  let inviteCode = "";
  const room = state.rooms.find((item) => item.code === code);
  if (room?.isPrivate) inviteCode = prompt("Введите код приглашения") || "";
  const result = await api("/api/game/join", { method: "POST", body: { roomCode: code, inviteCode } });
  state.room = result.room;
  state.view = "game";
  connectSocket(state.room.code);
  render();
}

async function checkNickname(event) {
  const hint = document.querySelector("#nicknameHint");
  const nickname = event.target.value;
  if (!hint || nickname.length < 3) {
    if (hint) hint.textContent = "";
    return;
  }
  const result = await api(`/api/users/check-nickname?nickname=${encodeURIComponent(nickname)}`);
  hint.className = `hint ${result.available ? "good" : "bad"}`;
  hint.textContent = result.available ? "Никнейм свободен" : "Уже занято";
}

function connectSocket(roomCode = state.room?.code || "") {
  if (state.ws && state.ws.readyState <= 1) state.ws.close();
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  state.ws = new WebSocket(`${protocol}://${location.host}/ws${roomCode ? `?room=${roomCode}` : ""}`);
  state.ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.event === "room_state") {
      state.room = message.room;
      if (state.view !== "game") state.view = "game";
      render();
    }
    if (message.event === "rooms_update") {
      state.rooms = message.rooms;
      if (state.view === "lobby") {
        const list = document.querySelector("#roomList");
        if (list) list.innerHTML = renderRooms(state.rooms);
      }
    }
    if (message.event === "toast") toast(message.message, message.tone);
    if (message.event === "error") toast(message.message, "pink");
  });
  state.ws.addEventListener("close", () => {
    if (state.user) setTimeout(() => connectSocket(state.room?.code || ""), 1400);
  });
}

function sendWs(payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    toast("Соединение восстанавливается. Повторите действие.", "pink");
    connectSocket(state.room?.code || "");
    return;
  }
  state.ws.send(JSON.stringify(payload));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    credentials: "include",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "Ошибка запроса");
  return payload;
}

function positionSeats() {
  const zone = document.querySelector("#tableZone");
  const seats = [...document.querySelectorAll(".seat")];
  if (!zone || !seats.length || matchMedia("(max-width: 900px)").matches) return;
  const rect = zone.getBoundingClientRect();
  const radiusX = Math.max(220, rect.width * 0.36);
  const radiusY = Math.max(170, rect.height * 0.33);
  seats.forEach((seat, index) => {
    const angle = Math.PI / 2 + (index / seats.length) * Math.PI * 2;
    const x = rect.width / 2 + Math.cos(angle) * radiusX - 60;
    const y = rect.height / 2 + Math.sin(angle) * radiusY - 80;
    seat.style.left = `${x}px`;
    seat.style.top = `${y}px`;
  });
}

function renderTimerOnly() {
  const timer = document.querySelector("#timer");
  if (!timer || !state.room?.phaseEndsAt || state.room.status !== "in_progress") {
    if (timer) timer.querySelector("span").textContent = "--";
    return;
  }
  const total = state.room.phase === "voting" ? 15_000 : 60_000;
  const left = Math.max(0, state.room.phaseEndsAt - Date.now());
  const seconds = Math.ceil(left / 1000);
  timer.style.setProperty("--progress", `${Math.round((left / total) * 100)}%`);
  timer.querySelector("span").textContent = String(seconds);
}

function phaseLabel(phase) {
  return { waiting: "Ожидание", discussion: "Обсуждение", voting: "Голосование", finished: "Финал" }[phase] || phase;
}

function toast(message, tone = "cyan") {
  state.toasts.push({ id: cryptoRandom(), message, tone });
  render();
  setTimeout(() => {
    state.toasts.shift();
    render();
  }, 3600);
}

function initials(value) {
  return String(value || "?").slice(0, 2).toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function debounce(fn, delay) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), delay);
  };
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2);
}

function initCanvas() {
  const canvas = document.querySelector("#cityCanvas");
  const ctx = canvas.getContext("2d");
  const buildings = Array.from({ length: 44 }, (_, index) => ({
    x: index / 43,
    w: 0.012 + Math.random() * 0.03,
    h: 0.18 + Math.random() * 0.52,
    hue: Math.random() > 0.55 ? "cyan" : "pink"
  }));
  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  }
  addEventListener("resize", resize);
  resize();
  function draw(time) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#171122");
    gradient.addColorStop(0.45, "#0e0d12");
    gradient.addColorStop(1, "#07070a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,240,255,0.12)";
    for (let i = 0; i < 80; i += 1) {
      const x = ((i * 97 + time * 0.012) % w);
      const y = ((i * 53) % (h * 0.62));
      ctx.fillRect(x, y, 1.2 * devicePixelRatio, 1.2 * devicePixelRatio);
    }
    buildings.forEach((building) => {
      const bw = building.w * w;
      const bh = building.h * h;
      const x = building.x * w;
      const y = h - bh;
      ctx.fillStyle = "rgba(10,9,15,0.92)";
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = building.hue === "cyan" ? "rgba(0,240,255,0.48)" : "rgba(255,0,85,0.42)";
      for (let wy = y + 18 * devicePixelRatio; wy < h - 18 * devicePixelRatio; wy += 24 * devicePixelRatio) {
        if (Math.sin(time * 0.002 + wy + x) > -0.25) ctx.fillRect(x + bw * 0.3, wy, bw * 0.35, 3 * devicePixelRatio);
      }
    });
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

