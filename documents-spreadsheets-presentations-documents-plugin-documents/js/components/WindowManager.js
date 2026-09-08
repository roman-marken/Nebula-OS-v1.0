(function () {
  "use strict";

  const appMeta = {
    terminal: { title: "Терминал", width: 680, height: 430 },
    files: { title: "Файловый менеджер", width: 720, height: 460 },
    settings: { title: "Настройки", width: 520, height: 430 },
    monitor: { title: "Системный монитор", width: 700, height: 500 },
    calculator: { title: "Калькулятор", width: 330, height: 430 }
  };

  class WindowManager {
    constructor({ root, store, bus }) {
      this.root = root;
      this.store = store;
      this.bus = bus;
      this.z = 20;
      this.instances = new Map();
      this.apps = new Map();
      this.bindEvents();
    }

    registerApp(id, factory) {
      this.apps.set(id, factory);
    }

    bindEvents() {
      this.bus.on("app:open", (app) => this.openApp(app));
      this.bus.on("window:focus", (id) => this.focusWindow(id));
      this.bus.on("window:restore", (id) => this.restoreWindow(id));
      this.bus.on("window:close", (id) => this.closeWindow(id));
    }

    openApp(app) {
      if (!Nebula.validators.isAppId(app)) return;
      const existing = this.store.getState().windows.find((win) => win.app === app && !win.closed);
      if (existing) {
        this.restoreWindow(existing.id);
        return;
      }
      const meta = appMeta[app];
      this.createWindow({ app, title: meta.title, width: meta.width, height: meta.height });
    }

    createWindow(config) {
      const id = `win-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
      const offset = this.store.getState().windows.length * 28;
      const width = Math.min(config.width, window.innerWidth - 32);
      const height = Math.min(config.height, window.innerHeight - 92);
      const left = Math.max(14, Math.min(170 + offset, window.innerWidth - width - 14));
      const top = Math.max(14, Math.min(82 + offset, window.innerHeight - height - 76));
      const element = document.createElement("article");
      element.className = "window";
      element.dataset.id = id;
      element.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;z-index:${++this.z}`;
      element.innerHTML = `
        <header class="window-titlebar">
          <div class="window-title">${Nebula.format.escapeHTML(config.title)}</div>
          <div class="window-controls">
            <button class="window-control minimize" type="button" title="Свернуть" aria-label="Свернуть">−</button>
            <button class="window-control maximize" type="button" title="Развернуть" aria-label="Развернуть">□</button>
            <button class="window-control close" type="button" title="Закрыть" aria-label="Закрыть">×</button>
          </div>
        </header>
        <div class="window-content"></div>
        <div class="resize-handle" aria-hidden="true"></div>
      `;

      this.root.append(element);
      this.bindWindow(element, id);

      const content = element.querySelector(".window-content");
      const factory = this.apps.get(config.app);
      const appInstance = factory?.(content, { id, windowManager: this });
      this.instances.set(id, { element, appInstance, maximized: false, previousRect: null });

      const nextWindows = [
        ...this.store.getState().windows,
        { id, app: config.app, title: config.title, minimized: false }
      ];
      this.store.patch({ windows: nextWindows, activeWindow: id });
      this.focusWindow(id);
      Nebula.notify?.push("Окно открыто", config.title);
      return id;
    }

    bindWindow(element, id) {
      const titlebar = element.querySelector(".window-titlebar");
      element.addEventListener("pointerdown", () => this.focusWindow(id));
      element.querySelector(".close").addEventListener("click", () => this.closeWindow(id));
      element.querySelector(".minimize").addEventListener("click", () => this.minimizeWindow(id));
      element.querySelector(".maximize").addEventListener("click", () => this.maximizeWindow(id));
      this.bindDrag(titlebar, element, id);
      this.bindResize(element.querySelector(".resize-handle"), element, id);
    }

    bindDrag(handle, element, id) {
      let start = null;
      const move = Nebula.throttle((event) => {
        if (!start) return;
        const x = Math.max(0, Math.min(event.clientX - start.dx, window.innerWidth - 120));
        const y = Math.max(0, Math.min(event.clientY - start.dy, window.innerHeight - 82));
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
      }, 0);
      handle.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".window-controls")) return;
        const rect = element.getBoundingClientRect();
        start = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        handle.setPointerCapture(event.pointerId);
        this.focusWindow(id);
      });
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", () => {
        start = null;
      });
    }

    bindResize(handle, element, id) {
      let start = null;
      const move = Nebula.throttle((event) => {
        if (!start) return;
        const width = Math.max(300, start.width + event.clientX - start.x);
        const height = Math.max(220, start.height + event.clientY - start.y);
        element.style.width = `${Math.min(width, window.innerWidth - start.left)}px`;
        element.style.height = `${Math.min(height, window.innerHeight - start.top - 68)}px`;
      }, 0);
      handle.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        const rect = element.getBoundingClientRect();
        start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, left: rect.left, top: rect.top };
        handle.setPointerCapture(event.pointerId);
        this.focusWindow(id);
      });
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", () => {
        start = null;
      });
    }

    focusWindow(id) {
      const record = this.instances.get(id);
      if (!record) return;
      this.instances.forEach(({ element }) => element.classList.remove("is-active"));
      record.element.classList.add("is-active");
      record.element.style.zIndex = `${++this.z}`;
      this.store.set("activeWindow", id);
    }

    minimizeWindow(id) {
      const record = this.instances.get(id);
      if (!record) return;
      record.element.classList.add("is-minimized");
      this.updateWindow(id, { minimized: true });
    }

    restoreWindow(id) {
      const record = this.instances.get(id);
      if (!record) return;
      record.element.classList.remove("is-minimized");
      this.updateWindow(id, { minimized: false });
      this.focusWindow(id);
    }

    maximizeWindow(id) {
      const record = this.instances.get(id);
      if (!record) return;
      const { element } = record;
      if (!record.maximized) {
        const rect = element.getBoundingClientRect();
        record.previousRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        element.style.left = "8px";
        element.style.top = "8px";
        element.style.width = "calc(100vw - 16px)";
        element.style.height = "calc(100vh - 86px)";
        record.maximized = true;
      } else {
        Object.entries(record.previousRect).forEach(([key, value]) => {
          element.style[key] = `${value}px`;
        });
        record.maximized = false;
      }
      this.focusWindow(id);
    }

    closeWindow(id) {
      const record = this.instances.get(id);
      if (!record) return;
      record.appInstance?.destroy?.();
      record.element.classList.add("is-closing");
      setTimeout(() => record.element.remove(), 150);
      this.instances.delete(id);
      const windows = this.store.getState().windows.filter((win) => win.id !== id);
      const lastWindow = windows[windows.length - 1];
      this.store.patch({ windows, activeWindow: lastWindow?.id || null });
    }

    closeActive() {
      const active = this.store.getState().activeWindow;
      if (active) this.closeWindow(active);
    }

    minimizeActive() {
      const active = this.store.getState().activeWindow;
      if (active) this.minimizeWindow(active);
    }

    focusNext() {
      const windows = this.store.getState().windows.filter((win) => !win.minimized);
      if (!windows.length) return;
      const currentIndex = windows.findIndex((win) => win.id === this.store.getState().activeWindow);
      const next = windows[(currentIndex + 1 + windows.length) % windows.length];
      this.focusWindow(next.id);
    }

    tileWindows() {
      const visible = this.store.getState().windows.filter((win) => !win.minimized);
      if (!visible.length) {
        Nebula.notify?.push("Окна", "Нет открытых окон для раскладки");
        return;
      }
      const cols = Math.ceil(Math.sqrt(visible.length));
      const rows = Math.ceil(visible.length / cols);
      const gap = 10;
      const availableWidth = window.innerWidth - gap * (cols + 1);
      const availableHeight = window.innerHeight - 76 - gap * (rows + 1);
      const width = Math.max(300, Math.floor(availableWidth / cols));
      const height = Math.max(220, Math.floor(availableHeight / rows));
      visible.forEach((win, index) => {
        const record = this.instances.get(win.id);
        if (!record) return;
        const col = index % cols;
        const row = Math.floor(index / cols);
        Object.assign(record.element.style, {
          left: `${gap + col * (width + gap)}px`,
          top: `${gap + row * (height + gap)}px`,
          width: `${width}px`,
          height: `${height}px`
        });
        record.maximized = false;
      });
      Nebula.notify?.push("Окна", "Окна уложены сеткой");
    }

    getSnapshot() {
      return this.store.getState().windows.map((win) => ({
        title: win.title,
        app: win.app,
        state: win.minimized ? "minimized" : "running"
      }));
    }

    updateWindow(id, patch) {
      const windows = this.store.getState().windows.map((win) => (win.id === id ? { ...win, ...patch } : win));
      this.store.patch({ windows });
    }
  }

  window.Nebula.WindowManager = WindowManager;
})();
