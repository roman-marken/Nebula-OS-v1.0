(function () {
  "use strict";

  const { Store, bus } = window.Nebula;
  const launcherApps = [
    { id: "terminal", title: "Терминал", glyph: "⌁", description: "Команды, диагностика, управление ОС" },
    { id: "files", title: "Файлы", glyph: "▣", description: "Виртуальная файловая система" },
    { id: "settings", title: "Настройки", glyph: "⚙", description: "Темы, обои, прозрачность" },
    { id: "monitor", title: "Монитор", glyph: "▥", description: "CPU, память, процессы" },
    { id: "calculator", title: "Калькулятор", glyph: "＋", description: "Быстрые вычисления" }
  ];

  function boot() {
    const bootScreen = document.getElementById("bootScreen");
    const progress = document.getElementById("bootProgress");
    const percent = document.getElementById("bootPercent");
    const status = document.getElementById("bootStatus");
    const messages = ["Инициализация ядра...", "Монтирование Nebula FS...", "Запуск оконного менеджера...", "Готово"];
    let value = 0;

    bootScreen.addEventListener("pointermove", Nebula.throttle((event) => {
      const x = ((event.clientX / window.innerWidth) - 0.5) * 18;
      const y = ((event.clientY / window.innerHeight) - 0.5) * 18;
      bootScreen.style.setProperty("--parallax-x", `${x}px`);
      bootScreen.style.setProperty("--parallax-y", `${y}px`);
    }, 16));

    const timer = setInterval(() => {
      value = Math.min(100, value + 4 + Math.random() * 9);
      const rounded = Math.round(value);
      progress.style.width = `${rounded}%`;
      percent.value = `${rounded}%`;
      status.textContent = messages[Math.min(messages.length - 1, Math.floor(rounded / 30))];
      if (rounded >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          bootScreen.classList.add("is-hidden");
          Nebula.notify.push("Nebula OS", "Система загружена");
        }, 280);
      }
    }, 70);
  }

  function applyTheme(theme) {
    if (!Nebula.validators.isTheme(theme)) return;
    document.body.classList.remove("theme-dark", "theme-light", "theme-custom");
    document.body.classList.add(`theme-${theme}`);
    Nebula.store.set("theme", theme);
    bus.emit("theme:changed", theme);
  }

  function applyWallpaper(wallpaper) {
    if (!Nebula.validators.isWallpaper(wallpaper)) return;
    document.body.classList.remove("wallpaper-aurora", "wallpaper-reef", "wallpaper-sunset", "wallpaper-grid");
    document.body.classList.add(`wallpaper-${wallpaper}`);
    Nebula.store.set("wallpaper", wallpaper);
  }

  function applyMotionPreference(enabled) {
    document.body.classList.toggle("reduce-motion", !enabled);
  }

  function applyState() {
    const state = Nebula.store.getState();
    document.body.classList.remove("theme-dark", "theme-light", "theme-custom", "wallpaper-aurora", "wallpaper-reef", "wallpaper-sunset", "wallpaper-grid");
    document.body.classList.add(`theme-${state.theme}`, `wallpaper-${state.wallpaper}`);
    document.body.style.setProperty("--window-alpha", state.settings.transparency);
    applyMotionPreference(state.settings.animations);
  }

  function setupDesktop() {
    const desktop = document.getElementById("desktop");
    const icons = Array.from(document.querySelectorAll(".desktop-icon"));
    const selectionBox = document.getElementById("selectionBox");
    let origin = null;

    icons.forEach((icon) => {
      icon.addEventListener("click", (event) => {
        if (!event.ctrlKey) icons.forEach((item) => item.classList.remove("is-selected"));
        icon.classList.toggle("is-selected");
      });
      icon.addEventListener("dblclick", () => bus.emit("app:open", icon.dataset.app));
    });

    desktop.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".window, .desktop-icon, .taskbar")) return;
      origin = { x: event.clientX, y: event.clientY };
      selectionBox.style.display = "block";
      selectionBox.style.left = `${origin.x}px`;
      selectionBox.style.top = `${origin.y}px`;
      selectionBox.style.width = "0";
      selectionBox.style.height = "0";
      icons.forEach((item) => item.classList.remove("is-selected"));
    });

    desktop.addEventListener("pointermove", Nebula.throttle((event) => {
      if (!origin) return;
      const left = Math.min(origin.x, event.clientX);
      const top = Math.min(origin.y, event.clientY);
      const width = Math.abs(event.clientX - origin.x);
      const height = Math.abs(event.clientY - origin.y);
      Object.assign(selectionBox.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`
      });
      const selectionRect = selectionBox.getBoundingClientRect();
      icons.forEach((icon) => {
        const rect = icon.getBoundingClientRect();
        const selected = !(rect.right < selectionRect.left || rect.left > selectionRect.right || rect.bottom < selectionRect.top || rect.top > selectionRect.bottom);
        icon.classList.toggle("is-selected", selected);
      });
    }, 16));

    window.addEventListener("pointerup", () => {
      origin = null;
      selectionBox.style.display = "none";
    });
  }

  function setupContextMenu(contextMenu) {
    const desktop = document.getElementById("desktop");
    desktop.addEventListener("contextmenu", (event) => {
      if (event.target.closest(".window")) return;
      event.preventDefault();
      contextMenu.show(event.clientX, event.clientY, [
        { label: "Открыть launcher", action: () => Nebula.launcher.open() },
        { label: "Открыть терминал", action: () => bus.emit("app:open", "terminal") },
        { label: "Открыть настройки", action: () => bus.emit("app:open", "settings") },
        { label: "Уложить окна", action: () => Nebula.windowManager.tileWindows() },
        { label: "Следующие обои", action: cycleWallpaper },
        { label: "Светлая/тёмная тема", action: toggleTheme }
      ]);
    });
  }

  function cycleWallpaper() {
    const wallpapers = ["aurora", "reef", "sunset", "grid"];
    const state = Nebula.store.getState();
    const index = wallpapers.indexOf(state.wallpaper);
    Nebula.applyWallpaper(wallpapers[(index + 1) % wallpapers.length]);
  }

  function toggleTheme() {
    const theme = Nebula.store.getState().theme === "dark" ? "light" : "dark";
    Nebula.applyTheme(theme);
  }

  function setupClock() {
    const time = document.getElementById("clockTime");
    const date = document.getElementById("clockDate");
    const tick = () => {
      const now = new Date();
      time.textContent = Nebula.format.timeFormat.format(now);
      date.textContent = Nebula.format.dateFormat.format(now);
    };
    tick();
    setInterval(tick, 1000);
  }

  function setupLauncher() {
    const launcher = document.getElementById("launcher");
    const grid = document.getElementById("launcherGrid");
    const search = document.getElementById("launcherSearch");
    const open = () => {
      launcher.classList.add("is-open");
      launcher.setAttribute("aria-hidden", "false");
      render(search.value);
      setTimeout(() => search.focus(), 20);
    };
    const close = () => {
      launcher.classList.remove("is-open");
      launcher.setAttribute("aria-hidden", "true");
      search.value = "";
    };
    const toggle = () => (launcher.classList.contains("is-open") ? close() : open());
    const launch = (appId) => {
      bus.emit("app:open", appId);
      close();
    };
    const render = (query = "") => {
      const normalized = query.trim().toLowerCase();
      const apps = launcherApps.filter((app) => `${app.title} ${app.description} ${app.id}`.toLowerCase().includes(normalized));
      grid.innerHTML = apps.map((app) => `
        <button class="launcher-item" type="button" data-app="${app.id}">
          <span>${app.glyph}</span>
          <span><strong>${Nebula.format.escapeHTML(app.title)}</strong><small>${Nebula.format.escapeHTML(app.description)}</small></span>
        </button>
      `).join("") || `<p class="muted">Ничего не найдено</p>`;
      grid.querySelectorAll("[data-app]").forEach((button) => {
        button.addEventListener("click", () => launch(button.dataset.app));
      });
    };

    document.getElementById("startButton").addEventListener("click", (event) => {
      event.stopPropagation();
      toggle();
    });
    document.getElementById("launcherClose").addEventListener("click", close);
    search.addEventListener("input", Nebula.debounce(() => render(search.value), 80));
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const first = grid.querySelector("[data-app]");
        if (first) launch(first.dataset.app);
      }
      if (event.key === "Escape") close();
    });
    document.querySelectorAll("[data-launcher-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.launcherAction;
        if (action === "tile") Nebula.windowManager.tileWindows();
        if (action === "theme") toggleTheme();
        if (action === "wallpaper") cycleWallpaper();
        close();
      });
    });
    document.addEventListener("click", (event) => {
      if (!launcher.contains(event.target) && !event.target.closest("#startButton")) close();
    });
    Nebula.launcher = { open, close, toggle, render };
    render();

    document.getElementById("notifyButton").addEventListener("click", () => {
      Nebula.notify.push("Центр уведомлений", "Очередь уведомлений активна");
    });
  }

  function setupKeyboard() {
    document.addEventListener("keydown", (event) => {
      const activeTag = document.activeElement?.tagName;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);
      if (event.key === "Escape") {
        Nebula.launcher?.close();
        Nebula.contextMenu?.hide();
      }
      if (typing) return;
      if (event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        Nebula.launcher?.toggle();
      }
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        bus.emit("app:open", "terminal");
      }
      if (event.altKey && event.key === "Tab") {
        event.preventDefault();
        Nebula.windowManager.focusNext();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        Nebula.windowManager.minimizeActive();
      }
    });
  }

  function init() {
    Nebula.store = Store.createStore(Store.loadState());
    Nebula.notify = new Nebula.NotificationCenter(document.getElementById("notifications"));
    Nebula.contextMenu = new Nebula.ContextMenu(document.getElementById("contextMenu"));
    Nebula.applyTheme = applyTheme;
    Nebula.applyWallpaper = applyWallpaper;
    Nebula.applyState = applyState;
    Nebula.applyMotionPreference = applyMotionPreference;

    applyState();
    setupClock();
    setupDesktop();
    setupContextMenu(Nebula.contextMenu);

    const wm = new Nebula.WindowManager({
      root: document.getElementById("windowLayer"),
      store: Nebula.store,
      bus
    });
    Nebula.windowManager = wm;
    wm.registerApp("terminal", (root) => new Nebula.TerminalApp(root));
    wm.registerApp("files", (root) => new Nebula.FileManagerApp(root));
    wm.registerApp("settings", (root) => new Nebula.SettingsApp(root));
    wm.registerApp("monitor", (root) => new Nebula.SystemMonitorApp(root));
    wm.registerApp("calculator", (root) => new Nebula.CalculatorApp(root));

    const taskbar = new Nebula.Taskbar({
      quickLaunch: document.getElementById("quickLaunch"),
      runningApps: document.getElementById("runningApps"),
      clock: document.getElementById("trayClock"),
      store: Nebula.store,
      bus
    });
    Nebula.dock = new Nebula.Dock(taskbar);
    setupLauncher();
    setupKeyboard();

    boot();
    setTimeout(() => bus.emit("app:open", "terminal"), 1300);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
