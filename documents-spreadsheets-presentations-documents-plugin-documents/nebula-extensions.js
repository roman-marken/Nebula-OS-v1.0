(function () {
  "use strict";

  const STORAGE_KEY = "nebula-os-state";
  const EXT_APPS = {
    browser: { id: "browser", title: "Browser", glyph: "⌕", width: 900, height: 580, description: "Вкладки, URL и поиск" },
    play: { id: "play", title: "Play", glyph: "▶", width: 820, height: 560, description: "Snake, Tic Tac Toe, Minesweeper" }
  };
  const BASE_APPS = [
    { id: "terminal", title: "Терминал", glyph: "⌁", description: "Команды, диагностика, управление ОС" },
    { id: "files", title: "Файлы", glyph: "▣", description: "Виртуальная файловая система" },
    { id: "settings", title: "Настройки", glyph: "⚙", description: "Темы, обои, прозрачность" },
    { id: "monitor", title: "Монитор", glyph: "▥", description: "CPU, память, процессы" },
    { id: "calculator", title: "Калькулятор", glyph: "＋", description: "Быстрые вычисления" },
    EXT_APPS.browser,
    EXT_APPS.play
  ].map((app) => app.id ? app : null).filter(Boolean);
  const APP_GLYPHS = Object.fromEntries(BASE_APPS.map((app) => [app.id, app.glyph]));

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function enrichState(state) {
    const next = state || {};
    next.apps = {
      terminal: { running: false },
      files: { running: false },
      settings: { running: false },
      monitor: { running: false },
      calculator: { running: false },
      browser: { running: false },
      play: { running: false },
      ...(next.apps || {})
    };
    next.desktopIcons = next.desktopIcons && typeof next.desktopIcons === "object" ? next.desktopIcons : {};
    next.browser = normalizeBrowserState(next.browser);
    return next;
  }

  function normalizeBrowserState(value) {
    const state = value && typeof value === "object" ? value : {};
    const tabs = Array.isArray(state.tabs) ? state.tabs.filter(Boolean).slice(0, 12) : [];
    return {
      activeTabId: state.activeTabId || tabs[0]?.id || null,
      tabs
    };
  }

  function patchStore() {
    if (!window.Nebula?.Store || window.Nebula.Store.__extensionsPatched) return;
    const originalLoadState = window.Nebula.Store.loadState;
    const originalCreateStore = window.Nebula.Store.createStore;

    window.Nebula.Store.loadState = function loadExtendedState() {
      return enrichState(originalLoadState());
    };

    window.Nebula.Store.createStore = function createExtendedStore(initialState) {
      const api = originalCreateStore(enrichState(initialState));
      const originalReset = api.reset.bind(api);
      api.persist = function persistExtendedState() {
        try {
          const state = enrichState(api.getState());
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            theme: state.theme,
            wallpaper: state.wallpaper,
            settings: state.settings,
            desktopIcons: state.desktopIcons,
            browser: state.browser
          }));
        } catch (error) {
          console.warn("[Nebula Store] Persist failed", error);
        }
      };
      api.reset = function resetExtendedState() {
        originalReset();
        api.patch({
          desktopIcons: {},
          browser: { activeTabId: null, tabs: [] },
          apps: {
            browser: { running: false },
            play: { running: false }
          }
        });
      };
      return api;
    };

    window.Nebula.Store.__extensionsPatched = true;
  }

  function patchValidators() {
    const validators = window.Nebula?.validators;
    if (!validators || validators.__extensionsPatched) return;
    const originalIsAppId = validators.isAppId;
    validators.isAppId = (value) => originalIsAppId(value) || Object.hasOwn(EXT_APPS, value);
    validators.__extensionsPatched = true;
  }

  function patchWindowManager() {
    const Manager = window.Nebula?.WindowManager;
    if (!Manager || Manager.__extensionsPatched) return;
    const originalOpenApp = Manager.prototype.openApp;
    Manager.prototype.openApp = function openExtendedApp(app) {
      if (!Object.hasOwn(EXT_APPS, app)) return originalOpenApp.call(this, app);
      const existing = this.store.getState().windows.find((win) => win.app === app && !win.closed);
      if (existing) {
        this.restoreWindow(existing.id);
        return;
      }
      const meta = EXT_APPS[app];
      this.createWindow({ app, title: meta.title, width: meta.width, height: meta.height });
    };
    Manager.__extensionsPatched = true;
  }

  function patchTaskbar() {
    const BaseTaskbar = window.Nebula?.Taskbar;
    if (!BaseTaskbar || BaseTaskbar.__extensionsPatched) return;

    class ExtendedTaskbar extends BaseTaskbar {
      constructor(options) {
        super(options);
        this.apps = BASE_APPS.map(({ id, title }) => ({ id, title }));
        this.renderQuickLaunch();
        this.renderRunning();
      }

      renderQuickLaunch() {
        this.quickLaunch.innerHTML = "";
        this.apps.forEach((app) => {
          const button = document.createElement("button");
          button.type = "button";
          button.title = app.title;
          button.setAttribute("aria-label", `Открыть ${app.title}`);
          button.textContent = APP_GLYPHS[app.id] || "□";
          button.addEventListener("click", () => this.bus.emit("app:open", app.id));
          this.quickLaunch.append(button);
        });
      }

      renderRunning() {
        const { windows, activeWindow } = this.store.getState();
        this.runningApps.innerHTML = "";
        windows.forEach((win) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = win.id === activeWindow ? "is-active" : "";
          button.innerHTML = `<span>${APP_GLYPHS[win.app] || "□"}</span><span>${Nebula.format.escapeHTML(win.title)}</span>`;
          button.addEventListener("click", () => {
            if (win.minimized) this.bus.emit("window:restore", win.id);
            else this.bus.emit("window:focus", win.id);
          });
          this.runningApps.append(button);
        });
      }
    }

    ExtendedTaskbar.__extensionsPatched = true;
    window.Nebula.Taskbar = ExtendedTaskbar;
  }

  function patchTerminal() {
    const BaseTerminal = window.Nebula?.TerminalApp;
    if (!BaseTerminal || BaseTerminal.__extensionsPatched) return;

    class ExtendedTerminalApp extends BaseTerminal {
      constructor(root, props) {
        super(root, props);
        this.commands = Array.from(new Set([...this.commands, "browser", "play"]));
      }

      execute(raw) {
        const [command, ...args] = raw.split(/\s+/);
        if (command === "help") {
          this.print([
            "Команды:",
            "  help, about, neofetch, clear, date",
            "  open [terminal|files|settings|monitor|calculator|browser|play]",
            "  theme [dark|light|custom]",
            "  wallpaper [aurora|reef|sunset|grid]",
            "  apps, windows, ps, storage",
            "  notify [текст], tile, minimize, close, reset"
          ].join("\n"));
          return;
        }
        if (command === "apps") {
          this.print("terminal\nfiles\nsettings\nmonitor\ncalculator\nbrowser\nplay");
          return;
        }
        if (command === "browser") {
          Nebula.bus.emit("app:open", "browser");
          return;
        }
        if (command === "play") {
          Nebula.bus.emit("app:open", "play");
          return;
        }
        super.execute(raw);
      }

      openApp(app) {
        if (!Nebula.validators.isAppId(app)) {
          this.print("Использование: open terminal|files|settings|monitor|calculator|browser|play", "error");
          return;
        }
        Nebula.bus.emit("app:open", app);
      }
    }

    ExtendedTerminalApp.__extensionsPatched = true;
    window.Nebula.TerminalApp = ExtendedTerminalApp;
  }

  function patchLauncherAfterBoot() {
    const launcher = window.Nebula?.launcher;
    if (!launcher || launcher.__extensionsPatched) return;
    const grid = document.getElementById("launcherGrid");
    const search = document.getElementById("launcherSearch");
    const close = launcher.close;

    launcher.render = function renderExtendedLauncher(query = "") {
      const normalized = query.trim().toLowerCase();
      const apps = BASE_APPS.filter((app) => `${app.title} ${app.description} ${app.id}`.toLowerCase().includes(normalized));
      grid.innerHTML = apps.map((app) => `
        <button class="launcher-item" type="button" data-app="${app.id}">
          <span>${app.glyph}</span>
          <span><strong>${Nebula.format.escapeHTML(app.title)}</strong><small>${Nebula.format.escapeHTML(app.description)}</small></span>
        </button>
      `).join("") || `<p class="muted">Ничего не найдено</p>`;
      grid.querySelectorAll("[data-app]").forEach((button) => {
        button.addEventListener("click", () => {
          Nebula.bus.emit("app:open", button.dataset.app);
          close();
        });
      });
    };

    search.addEventListener("input", Nebula.debounce(() => launcher.render(search.value), 80));
    document.getElementById("startButton")?.addEventListener("click", () => {
      setTimeout(() => launcher.render(search.value), 0);
    });
    launcher.__extensionsPatched = true;
    launcher.render(search.value);
  }

  function enableDesktopIconDrag() {
    const desktop = document.getElementById("desktop");
    const desktopIcons = document.getElementById("desktopIcons");
    if (!desktop || !desktopIcons || desktopIcons.__dragEnabled) return;
    const icons = Array.from(desktopIcons.querySelectorAll(".desktop-icon"));
    const cell = { width: 104, height: 104 };
    desktopIcons.classList.add("is-positioned");

    function bounds() {
      const rect = desktopIcons.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(value, max));
    }

    function cellFor(pos) {
      return {
        col: Math.max(0, Math.round((pos?.x || 0) / cell.width)),
        row: Math.max(0, Math.round((pos?.y || 0) / cell.height))
      };
    }

    function posFor(slot, maxX, maxY) {
      return {
        x: clamp(slot.col * cell.width, 0, maxX),
        y: clamp(slot.row * cell.height, 0, maxY)
      };
    }

    function occupiedCells(exceptApp = "") {
      const current = Nebula.store.getState().desktopIcons || {};
      const occupied = new Set();
      Object.entries(current).forEach(([app, pos]) => {
        if (app !== exceptApp) {
          const slot = cellFor(pos);
          occupied.add(`${slot.col}:${slot.row}`);
        }
      });
      return occupied;
    }

    function findFreePosition(icon, raw, exceptApp) {
      const area = bounds();
      const maxX = Math.max(0, area.width - icon.offsetWidth);
      const maxY = Math.max(0, area.height - icon.offsetHeight);
      const maxCol = Math.max(0, Math.floor(maxX / cell.width));
      const maxRow = Math.max(0, Math.floor(maxY / cell.height));
      const target = cellFor({ x: clamp(raw.x, 0, maxX), y: clamp(raw.y, 0, maxY) });
      const occupied = occupiedCells(exceptApp);

      for (let radius = 0; radius <= Math.max(maxCol, maxRow) + 1; radius += 1) {
        for (let row = target.row - radius; row <= target.row + radius; row += 1) {
          for (let col = target.col - radius; col <= target.col + radius; col += 1) {
            if (col < 0 || row < 0 || col > maxCol || row > maxRow) continue;
            if (Math.abs(col - target.col) !== radius && Math.abs(row - target.row) !== radius) continue;
            const key = `${col}:${row}`;
            if (!occupied.has(key)) return posFor({ col, row }, maxX, maxY);
          }
        }
      }
      return posFor({ col: clamp(target.col, 0, maxCol), row: clamp(target.row, 0, maxRow) }, maxX, maxY);
    }

    function applyPosition(icon, pos) {
      icon.style.left = `${Math.round(pos.x)}px`;
      icon.style.top = `${Math.round(pos.y)}px`;
    }

    function defaultPosition(index) {
      const area = bounds();
      const maxY = Math.max(0, area.height - 88);
      const rows = Math.max(1, Math.floor(maxY / cell.height) + 1);
      return {
        x: Math.floor(index / rows) * cell.width,
        y: (index % rows) * cell.height
      };
    }

    function layoutIcons(persist = false) {
      const saved = Nebula.store.getState().desktopIcons || {};
      const next = {};
      icons.forEach((icon, index) => {
        const app = icon.dataset.app;
        const raw = saved[app] || defaultPosition(index);
        const pos = findFreePosition(icon, raw, app);
        next[app] = pos;
        applyPosition(icon, pos);
      });
      if (persist) Nebula.store.set("desktopIcons", next);
    }

    icons.forEach((icon) => {
      let drag = null;
      icon.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const area = bounds();
        const rect = icon.getBoundingClientRect();
        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          moved: false
        };
        icon.setPointerCapture(event.pointerId);
      });

      icon.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (!drag.moved && distance < 5) return;
        drag.moved = true;
        event.preventDefault();
        const area = bounds();
        const x = clamp(event.clientX - area.left - drag.offsetX, 0, Math.max(0, area.width - icon.offsetWidth));
        const y = clamp(event.clientY - area.top - drag.offsetY, 0, Math.max(0, area.height - icon.offsetHeight));
        icon.classList.add("is-dragging");
        desktopIcons.classList.add("is-drag-active");
        applyPosition(icon, { x, y });
      });

      icon.addEventListener("pointerup", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        icon.releasePointerCapture(event.pointerId);
        if (drag.moved) {
          const pos = findFreePosition(icon, {
            x: parseFloat(icon.style.left) || 0,
            y: parseFloat(icon.style.top) || 0
          }, icon.dataset.app);
          const current = Nebula.store.getState().desktopIcons || {};
          Nebula.store.set("desktopIcons", { ...current, [icon.dataset.app]: pos });
          applyPosition(icon, pos);
          icon.dataset.dragged = "true";
          setTimeout(() => {
            delete icon.dataset.dragged;
          }, 0);
        }
        icon.classList.remove("is-dragging");
        desktopIcons.classList.remove("is-drag-active");
        drag = null;
      });

      icon.addEventListener("click", (event) => {
        if (icon.dataset.dragged === "true") {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    });

    window.addEventListener("resize", Nebula.debounce(() => layoutIcons(true), 140));
    desktopIcons.__dragEnabled = true;
    layoutIcons(!Object.keys(Nebula.store.getState().desktopIcons || {}).length);
  }

  const BROWSER_HOME = "nebula://home";

  class BrowserApp extends Nebula.Component {
    constructor(root) {
      super(root);
      this.loadingTimers = new Map();
      const saved = normalizeBrowserState(Nebula.store.getState().browser);
      this.tabs = saved.tabs.length ? saved.tabs.map((tab) => this.normalizeTab(tab)) : [this.createTab()];
      this.activeTabId = saved.activeTabId && this.tabs.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId : this.tabs[0].id;
      this.render();
      this.save();
    }

    normalizeTab(tab) {
      const history = Array.isArray(tab.history) && tab.history.length ? tab.history.filter(Boolean).slice(-20) : [tab.url || BROWSER_HOME];
      const index = Math.max(0, Math.min(Number(tab.index) || 0, history.length - 1));
      return {
        id: tab.id || this.id(),
        title: tab.title || this.titleFor(history[index]),
        url: history[index] || BROWSER_HOME,
        history,
        index,
        loading: false,
        error: ""
      };
    }

    createTab(url = BROWSER_HOME) {
      return {
        id: this.id(),
        title: this.titleFor(url),
        url,
        history: [url],
        index: 0,
        loading: false,
        error: ""
      };
    }

    id() {
      return `tab-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
    }

    activeTab() {
      return this.tabs.find((tab) => tab.id === this.activeTabId) || this.tabs[0];
    }

    titleFor(url) {
      if (!url || url === BROWSER_HOME) return "Новая вкладка";
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "Ошибка";
      }
    }

    render() {
      const tab = this.activeTab();
      this.root.innerHTML = `
        <section class="browser-app">
          <div class="browser-tabs" role="tablist">
            ${this.tabs.map((item) => `
              <button class="browser-tab ${item.id === this.activeTabId ? "is-active" : ""}" type="button" data-tab="${item.id}" role="tab" aria-selected="${item.id === this.activeTabId}">
                <span>${Nebula.format.escapeHTML(item.loading ? "Загрузка..." : item.title)}</span>
                <span class="browser-tab-close" data-close-tab="${item.id}" aria-label="Закрыть вкладку">×</span>
              </button>
            `).join("")}
            <button class="browser-new-tab" type="button" data-action="new-tab" title="Новая вкладка" aria-label="Новая вкладка">＋</button>
          </div>
          <form class="browser-toolbar" data-browser-form>
            <button type="button" data-action="back" title="Назад" aria-label="Назад" ${tab.index <= 0 ? "disabled" : ""}>‹</button>
            <button type="button" data-action="forward" title="Вперёд" aria-label="Вперёд" ${tab.index >= tab.history.length - 1 ? "disabled" : ""}>›</button>
            <button type="button" data-action="reload" title="Обновить" aria-label="Обновить">↻</button>
            <button type="button" data-action="stop" class="browser-stop" title="Остановить" aria-label="Остановить" ${tab.loading ? "" : "disabled"}>×</button>
            <button type="button" data-action="home" title="Домой" aria-label="Домой">⌂</button>
            <input class="browser-address" value="${Nebula.format.escapeHTML(tab.url === BROWSER_HOME ? "" : tab.url)}" placeholder="Введите URL или поисковый запрос" autocomplete="off" spellcheck="false" aria-label="Адрес">
            <button type="submit" title="Перейти" aria-label="Перейти">↵</button>
          </form>
          <div class="browser-status">${Nebula.format.escapeHTML(tab.loading ? "Загрузка страницы..." : tab.error || tab.url)}</div>
          <div class="browser-view">${this.renderView(tab)}</div>
        </section>
      `;
      this.bind();
      this.attachFrame(tab);
    }

    renderView(tab) {
      if (tab.error) {
        return `
          <section class="browser-message">
            <strong>Не удалось открыть страницу</strong>
            <p>${Nebula.format.escapeHTML(tab.error)}</p>
            <button type="button" data-action="reload">Повторить</button>
          </section>
        `;
      }
      if (tab.url === BROWSER_HOME) {
        return `
          <section class="browser-home">
            <div class="nebula-logo mini" aria-hidden="true"><span></span><strong>N</strong></div>
            <h2>Browser</h2>
            <form class="browser-home-search" data-home-form>
              <input placeholder="Поиск или адрес сайта" autocomplete="off" spellcheck="false" aria-label="Поиск или адрес">
              <button type="submit">↵</button>
            </form>
            <div class="browser-shortcuts">
              <button type="button" data-open-url="https://example.com">Example</button>
              <button type="button" data-open-url="https://developer.mozilla.org">MDN</button>
              <button type="button" data-open-url="https://www.wikipedia.org">Wikipedia</button>
            </div>
          </section>
        `;
      }
      return `<iframe class="browser-frame" data-frame-tab="${tab.id}" src="${Nebula.format.escapeHTML(tab.url)}" title="${Nebula.format.escapeHTML(tab.title)}" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe>`;
    }

    bind() {
      this.root.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          this.activeTabId = button.dataset.tab;
          this.render();
          this.save();
        });
      });
      this.root.querySelectorAll("[data-close-tab]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          this.closeTab(button.dataset.closeTab);
        });
      });
      this.root.querySelector("[data-browser-form]").addEventListener("submit", (event) => {
        event.preventDefault();
        this.navigate(this.root.querySelector(".browser-address").value);
      });
      this.root.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => this.handleAction(button.dataset.action));
      });
      const homeForm = this.root.querySelector("[data-home-form]");
      if (homeForm) {
        homeForm.addEventListener("submit", (event) => {
          event.preventDefault();
          this.navigate(homeForm.querySelector("input").value);
        });
      }
      this.root.querySelectorAll("[data-open-url]").forEach((button) => {
        button.addEventListener("click", () => this.navigate(button.dataset.openUrl));
      });
    }

    attachFrame(tab) {
      const frame = this.root.querySelector(`[data-frame-tab="${tab.id}"]`);
      if (!frame) return;
      frame.addEventListener("load", () => {
        const current = this.tabs.find((item) => item.id === tab.id);
        if (!current) return;
        current.loading = false;
        this.clearLoadTimer(tab.id);
        this.updateChromeState();
        this.save();
      });
      frame.addEventListener("error", () => {
        this.fail(tab, "Браузер не смог загрузить документ в iframe.");
      });
      if (tab.loading) {
        this.clearLoadTimer(tab.id);
        this.loadingTimers.set(tab.id, setTimeout(() => {
          const current = this.tabs.find((item) => item.id === tab.id);
          if (!current || !current.loading) return;
          current.loading = false;
          current.error = "Страница не ответила или запретила отображение внутри iframe. Такое часто происходит из-за X-Frame-Options или CSP.";
          this.render();
          this.save();
        }, 9000));
      }
    }

    handleAction(action) {
      if (action === "new-tab") this.newTab();
      if (action === "back") this.go(-1);
      if (action === "forward") this.go(1);
      if (action === "reload") this.reload();
      if (action === "stop") this.stop();
      if (action === "home") this.navigate(BROWSER_HOME);
    }

    normalizeInput(input) {
      const value = String(input || "").trim();
      if (!value || value === BROWSER_HOME) return { url: BROWSER_HOME };
      if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
        return { error: "Поддерживаются только http и https URL." };
      }
      if (/^https?:\/\//i.test(value)) return this.validUrl(value);
      if (/^[^\s]+\.[^\s]+/.test(value)) return this.validUrl(`https://${value}`);
      return { url: `https://www.bing.com/search?q=${encodeURIComponent(value)}` };
    }

    validUrl(value) {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) return { error: "Поддерживаются только http и https URL." };
        return { url: url.href };
      } catch {
        return { error: "Некорректный URL." };
      }
    }

    navigate(input, replace = false) {
      const tab = this.activeTab();
      const normalized = this.normalizeInput(input);
      if (normalized.error) {
        tab.error = normalized.error;
        tab.loading = false;
        this.render();
        this.save();
        return;
      }
      const url = normalized.url;
      tab.url = url;
      tab.title = this.titleFor(url);
      tab.error = "";
      tab.loading = url !== BROWSER_HOME;
      if (replace) {
        tab.history[tab.index] = url;
      } else {
        tab.history = tab.history.slice(0, tab.index + 1);
        tab.history.push(url);
        tab.history = tab.history.slice(-20);
        tab.index = tab.history.length - 1;
      }
      this.render();
      this.save();
    }

    newTab() {
      const tab = this.createTab();
      this.tabs.push(tab);
      this.activeTabId = tab.id;
      this.render();
      this.save();
    }

    closeTab(id) {
      this.clearLoadTimer(id);
      const index = this.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      this.tabs.splice(index, 1);
      if (!this.tabs.length) this.tabs.push(this.createTab());
      if (this.activeTabId === id) this.activeTabId = this.tabs[Math.max(0, index - 1)].id;
      this.render();
      this.save();
    }

    go(delta) {
      const tab = this.activeTab();
      const next = tab.index + delta;
      if (next < 0 || next >= tab.history.length) return;
      tab.index = next;
      tab.url = tab.history[tab.index];
      tab.title = this.titleFor(tab.url);
      tab.error = "";
      tab.loading = tab.url !== BROWSER_HOME;
      this.render();
      this.save();
    }

    reload() {
      const tab = this.activeTab();
      if (tab.url === BROWSER_HOME) {
        this.render();
        return;
      }
      tab.error = "";
      tab.loading = true;
      this.render();
      this.save();
    }

    stop() {
      const tab = this.activeTab();
      tab.loading = false;
      tab.error = "Загрузка остановлена.";
      this.clearLoadTimer(tab.id);
      const frame = this.root.querySelector(".browser-frame");
      if (frame) frame.src = "about:blank";
      this.render();
      this.save();
    }

    fail(tab, message) {
      tab.loading = false;
      tab.error = message;
      this.clearLoadTimer(tab.id);
      this.render();
      this.save();
    }

    updateChromeState() {
      const tab = this.activeTab();
      const status = this.root.querySelector(".browser-status");
      const stop = this.root.querySelector(".browser-stop");
      if (status) status.textContent = tab.loading ? "Загрузка страницы..." : tab.error || tab.url;
      if (stop) stop.disabled = !tab.loading;
    }

    clearLoadTimer(id) {
      clearTimeout(this.loadingTimers.get(id));
      this.loadingTimers.delete(id);
    }

    save() {
      Nebula.store.set("browser", {
        activeTabId: this.activeTabId,
        tabs: this.tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          history: tab.history,
          index: tab.index
        }))
      });
    }

    destroy() {
      this.loadingTimers.forEach((timer) => clearTimeout(timer));
      super.destroy();
    }
  }

  class PlayApp extends Nebula.Component {
    constructor(root) {
      super(root);
      this.view = "library";
      this.snakeTimer = null;
      this.snakeBest = Number(localStorage.getItem("nebula-play-snake-best") || 0);
      this.ttt = this.newTicTacToeState();
      this.mines = this.newMinesState();
      this.on(document, "keydown", (event) => this.handleKey(event));
      this.render();
    }

    render() {
      this.root.innerHTML = `
        <section class="play-app">
          ${this.view === "library" ? this.renderLibrary() : this.renderGameShell()}
        </section>
      `;
      this.bind();
      if (this.view === "snake") this.renderSnakeBoard();
      if (this.view === "tictactoe") this.renderTicTacToeBoard();
      if (this.view === "minesweeper") this.renderMinesBoard();
    }

    renderLibrary() {
      const games = [
        { id: "snake", title: "Snake", glyph: "▰", meta: "Счёт, еда, пауза, WASD/стрелки" },
        { id: "tictactoe", title: "Tic Tac Toe", glyph: "×○", meta: "Поле 3x3, победа и ничья" },
        { id: "minesweeper", title: "Minesweeper", glyph: "✦", meta: "Мины, флаги, раскрытие областей" }
      ];
      return `
        <header class="play-header">
          <div><strong>PLAY</strong><span>Игровая библиотека Nebula</span></div>
        </header>
        <div class="play-library">
          ${games.map((game) => `
            <button class="play-card" type="button" data-game="${game.id}">
              <span class="play-card-glyph">${game.glyph}</span>
              <span><strong>${game.title}</strong><small>${game.meta}</small></span>
            </button>
          `).join("")}
        </div>
      `;
    }

    renderGameShell() {
      const title = { snake: "Snake", tictactoe: "Tic Tac Toe", minesweeper: "Minesweeper" }[this.view];
      return `
        <div class="app-toolbar play-toolbar">
          <button type="button" data-action="library">‹ Библиотека</button>
          <button type="button" data-action="restart">↻ Restart</button>
          <strong>${title}</strong>
        </div>
        <section class="play-stage play-stage-${this.view}">
          ${this.view === "snake" ? this.renderSnake() : ""}
          ${this.view === "tictactoe" ? this.renderTicTacToe() : ""}
          ${this.view === "minesweeper" ? this.renderMinesweeper() : ""}
        </section>
      `;
    }

    bind() {
      this.root.querySelectorAll("[data-game]").forEach((button) => {
        button.addEventListener("click", () => this.openGame(button.dataset.game));
      });
      this.root.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => this.action(button.dataset.action));
      });
      this.root.querySelectorAll("[data-ttt]").forEach((button) => {
        button.addEventListener("click", () => this.playTicTacToe(Number(button.dataset.ttt)));
      });
      this.root.querySelectorAll("[data-mine]").forEach((button) => {
        button.addEventListener("click", () => this.revealMine(Number(button.dataset.mine)));
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          this.flagMine(Number(button.dataset.mine));
        });
      });
    }

    openGame(game) {
      this.stopSnake();
      this.view = game;
      if (game === "snake") this.startSnake();
      if (game === "tictactoe") this.ttt = this.newTicTacToeState();
      if (game === "minesweeper") this.mines = this.newMinesState();
      this.render();
    }

    action(action) {
      if (action === "library") {
        this.stopSnake();
        this.view = "library";
        this.render();
      }
      if (action === "restart") {
        if (this.view === "snake") this.startSnake();
        if (this.view === "tictactoe") this.ttt = this.newTicTacToeState();
        if (this.view === "minesweeper") this.mines = this.newMinesState();
        this.render();
      }
      if (action === "pause-snake" && this.snake && !this.snake.over) {
        this.snake.paused = !this.snake.paused;
        this.renderSnakeBoard();
      }
    }

    windowIsActive() {
      return this.root.closest(".window")?.classList.contains("is-active");
    }

    handleKey(event) {
      if (this.view !== "snake" || !this.snake || !this.windowIsActive()) return;
      const dirs = {
        ArrowUp: { x: 0, y: -1 },
        KeyW: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        KeyS: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        KeyA: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        KeyD: { x: 1, y: 0 }
      };
      if (event.code === "Space") {
        event.preventDefault();
        this.action("pause-snake");
        return;
      }
      const next = dirs[event.code] || dirs[event.key];
      if (!next) return;
      event.preventDefault();
      if (next.x + this.snake.dir.x === 0 && next.y + this.snake.dir.y === 0) return;
      this.snake.pending = next;
    }

    startSnake() {
      this.stopSnake();
      this.snake = {
        size: 18,
        body: [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }],
        dir: { x: 1, y: 0 },
        pending: { x: 1, y: 0 },
        food: { x: 12, y: 9 },
        score: 0,
        over: false,
        paused: false
      };
      this.placeFood();
      this.snakeTimer = setInterval(() => this.tickSnake(), 118);
    }

    stopSnake() {
      clearInterval(this.snakeTimer);
      this.snakeTimer = null;
    }

    tickSnake() {
      if (!this.snake || this.snake.over || this.snake.paused) return;
      this.snake.dir = this.snake.pending;
      const head = this.snake.body[0];
      const next = { x: head.x + this.snake.dir.x, y: head.y + this.snake.dir.y };
      const hitWall = next.x < 0 || next.y < 0 || next.x >= this.snake.size || next.y >= this.snake.size;
      const hitBody = this.snake.body.some((part) => part.x === next.x && part.y === next.y);
      if (hitWall || hitBody) {
        this.snake.over = true;
        this.snakeBest = Math.max(this.snakeBest, this.snake.score);
        localStorage.setItem("nebula-play-snake-best", String(this.snakeBest));
        this.renderSnakeBoard();
        return;
      }
      this.snake.body.unshift(next);
      if (next.x === this.snake.food.x && next.y === this.snake.food.y) {
        this.snake.score += 10;
        this.placeFood();
      } else {
        this.snake.body.pop();
      }
      this.renderSnakeBoard();
    }

    placeFood() {
      const free = [];
      for (let y = 0; y < this.snake.size; y += 1) {
        for (let x = 0; x < this.snake.size; x += 1) {
          if (!this.snake.body.some((part) => part.x === x && part.y === y)) free.push({ x, y });
        }
      }
      this.snake.food = free[Math.floor(Math.random() * free.length)] || this.snake.food;
    }

    renderSnake() {
      return `
        <aside class="play-stats">
          <div><strong data-snake-score>0</strong><span>Score</span></div>
          <div><strong>${this.snakeBest}</strong><span>Best</span></div>
          <button type="button" data-action="pause-snake">Pause</button>
        </aside>
        <div class="snake-board" data-snake-board></div>
        <div class="play-result" data-snake-result></div>
      `;
    }

    renderSnakeBoard() {
      if (!this.snake) return;
      const board = this.root.querySelector("[data-snake-board]");
      const score = this.root.querySelector("[data-snake-score]");
      const result = this.root.querySelector("[data-snake-result]");
      if (!board) return;
      const parts = new Set(this.snake.body.map((part) => `${part.x}:${part.y}`));
      board.innerHTML = "";
      for (let y = 0; y < this.snake.size; y += 1) {
        for (let x = 0; x < this.snake.size; x += 1) {
          const cell = document.createElement("span");
          const key = `${x}:${y}`;
          cell.className = parts.has(key) ? "snake-cell snake-body" : "snake-cell";
          if (x === this.snake.body[0].x && y === this.snake.body[0].y) cell.classList.add("snake-head");
          if (x === this.snake.food.x && y === this.snake.food.y) cell.className = "snake-cell snake-food";
          board.append(cell);
        }
      }
      if (score) score.textContent = this.snake.score;
      if (result) result.textContent = this.snake.over ? "Game Over" : this.snake.paused ? "Paused" : "";
    }

    newTicTacToeState() {
      return { board: Array(9).fill(""), turn: "X", over: false, result: "Ход X" };
    }

    renderTicTacToe() {
      return `
        <div class="ttt-board">${this.ttt.board.map((value, index) => `<button type="button" data-ttt="${index}" ${value || this.ttt.over ? "disabled" : ""}>${value}</button>`).join("")}</div>
        <div class="play-result">${Nebula.format.escapeHTML(this.ttt.result)}</div>
      `;
    }

    renderTicTacToeBoard() {
      const board = this.root.querySelector(".ttt-board");
      const result = this.root.querySelector(".play-result");
      if (!board) return;
      board.querySelectorAll("[data-ttt]").forEach((button) => {
        const index = Number(button.dataset.ttt);
        button.textContent = this.ttt.board[index];
        button.disabled = Boolean(this.ttt.board[index] || this.ttt.over);
      });
      if (result) result.textContent = this.ttt.result;
    }

    playTicTacToe(index) {
      if (this.ttt.over || this.ttt.board[index]) return;
      this.ttt.board[index] = this.ttt.turn;
      const winner = this.tttWinner();
      if (winner) {
        this.ttt.over = true;
        this.ttt.result = `Победил ${winner}`;
      } else if (this.ttt.board.every(Boolean)) {
        this.ttt.over = true;
        this.ttt.result = "Ничья";
      } else {
        this.ttt.turn = this.ttt.turn === "X" ? "O" : "X";
        this.ttt.result = `Ход ${this.ttt.turn}`;
      }
      this.renderTicTacToeBoard();
    }

    tttWinner() {
      const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      return lines.map(([a, b, c]) => this.ttt.board[a] && this.ttt.board[a] === this.ttt.board[b] && this.ttt.board[a] === this.ttt.board[c] ? this.ttt.board[a] : "").find(Boolean);
    }

    newMinesState() {
      return {
        rows: 10,
        cols: 10,
        mines: 14,
        grid: [],
        ready: false,
        over: false,
        won: false,
        flags: 0,
        opened: 0
      };
    }

    renderMinesweeper() {
      return `
        <aside class="play-stats mines-stats">
          <div><strong data-mine-count>${this.mines.mines - this.mines.flags}</strong><span>Mines</span></div>
          <div><strong data-mine-opened>${this.mines.opened}</strong><span>Open</span></div>
        </aside>
        <div class="mines-board" data-mines-board></div>
        <div class="play-result" data-mines-result></div>
      `;
    }

    buildMines(exclude) {
      const total = this.mines.rows * this.mines.cols;
      this.mines.grid = Array.from({ length: total }, (_, index) => ({
        index,
        mine: false,
        open: false,
        flag: false,
        adjacent: 0
      }));
      const banned = new Set([exclude, ...this.neighbors(exclude)]);
      const choices = this.mines.grid.map((cell) => cell.index).filter((index) => !banned.has(index));
      for (let placed = 0; placed < this.mines.mines && choices.length; placed += 1) {
        const choice = choices.splice(Math.floor(Math.random() * choices.length), 1)[0];
        this.mines.grid[choice].mine = true;
      }
      this.mines.grid.forEach((cell) => {
        cell.adjacent = this.neighbors(cell.index).filter((index) => this.mines.grid[index]?.mine).length;
      });
      this.mines.ready = true;
    }

    neighbors(index) {
      const row = Math.floor(index / this.mines.cols);
      const col = index % this.mines.cols;
      const result = [];
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nc >= 0 && nr < this.mines.rows && nc < this.mines.cols) result.push(nr * this.mines.cols + nc);
        }
      }
      return result;
    }

    revealMine(index) {
      if (this.mines.over || this.mines.won) return;
      if (!this.mines.ready) this.buildMines(index);
      const cell = this.mines.grid[index];
      if (!cell || cell.flag || cell.open) return;
      if (cell.mine) {
        cell.open = true;
        this.mines.over = true;
        this.mines.grid.forEach((item) => {
          if (item.mine) item.open = true;
        });
        this.renderMinesBoard();
        return;
      }
      this.floodOpen(index);
      this.checkMinesWin();
      this.renderMinesBoard();
    }

    floodOpen(index) {
      const queue = [index];
      while (queue.length) {
        const current = this.mines.grid[queue.shift()];
        if (!current || current.open || current.flag) continue;
        current.open = true;
        this.mines.opened += 1;
        if (current.adjacent !== 0) continue;
        this.neighbors(current.index).forEach((next) => {
          const cell = this.mines.grid[next];
          if (cell && !cell.open && !cell.flag && !cell.mine) queue.push(next);
        });
      }
    }

    flagMine(index) {
      if (this.mines.over || this.mines.won) return;
      if (!this.mines.ready) this.buildMines(index);
      const cell = this.mines.grid[index];
      if (!cell || cell.open) return;
      cell.flag = !cell.flag;
      this.mines.flags += cell.flag ? 1 : -1;
      this.renderMinesBoard();
    }

    checkMinesWin() {
      const safe = this.mines.rows * this.mines.cols - this.mines.mines;
      if (this.mines.opened >= safe) {
        this.mines.won = true;
        this.mines.grid.forEach((cell) => {
          if (cell.mine) cell.flag = true;
        });
        this.mines.flags = this.mines.mines;
      }
    }

    renderMinesBoard() {
      const board = this.root.querySelector("[data-mines-board]");
      const mineCount = this.root.querySelector("[data-mine-count]");
      const opened = this.root.querySelector("[data-mine-opened]");
      const result = this.root.querySelector("[data-mines-result]");
      if (!board) return;
      const grid = this.mines.ready ? this.mines.grid : Array.from({ length: this.mines.rows * this.mines.cols }, (_, index) => ({ index }));
      board.innerHTML = grid.map((cell) => {
        const label = cell.open ? (cell.mine ? "✦" : cell.adjacent || "") : cell.flag ? "⚑" : "";
        const tone = cell.open && cell.mine ? " mine-hit" : cell.open ? ` is-open count-${cell.adjacent || 0}` : cell.flag ? " is-flagged" : "";
        return `<button type="button" data-mine="${cell.index}" class="${tone}" ${cell.open ? "disabled" : ""}>${label}</button>`;
      }).join("");
      board.querySelectorAll("[data-mine]").forEach((button) => {
        button.addEventListener("click", () => this.revealMine(Number(button.dataset.mine)));
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          this.flagMine(Number(button.dataset.mine));
        });
      });
      if (mineCount) mineCount.textContent = this.mines.mines - this.mines.flags;
      if (opened) opened.textContent = this.mines.opened;
      if (result) result.textContent = this.mines.over ? "Game Over" : this.mines.won ? "Победа" : "";
    }

    destroy() {
      this.stopSnake();
      super.destroy();
    }
  }

  window.Nebula.BrowserApp = BrowserApp;
  window.Nebula.PlayApp = PlayApp;

  patchStore();
  patchValidators();
  patchWindowManager();
  patchTaskbar();
  patchTerminal();

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      patchLauncherAfterBoot();
      enableDesktopIconDrag();
      Nebula.windowManager?.registerApp("browser", (root) => new Nebula.BrowserApp(root));
      Nebula.windowManager?.registerApp("play", (root) => new Nebula.PlayApp(root));
    }, 0);
  });
})();
