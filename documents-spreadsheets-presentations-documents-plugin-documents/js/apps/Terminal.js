(function () {
  "use strict";

  class TerminalApp extends Nebula.Component {
    constructor(root) {
      super(root);
      this.history = [];
      this.historyIndex = 0;
      this.commands = ["help", "about", "neofetch", "clear", "open", "theme", "wallpaper", "date", "files", "apps", "windows", "ps", "notify", "tile", "minimize", "close", "reset", "storage"];
      this.root.innerHTML = `
        <section class="terminal" aria-label="Терминал">
          <div class="terminal-output" role="log"></div>
          <label class="terminal-row">
            <span class="terminal-prompt">nebula@os:~$</span>
            <input class="terminal-input" autocomplete="off" spellcheck="false" aria-label="Командная строка">
          </label>
        </section>
      `;
      this.output = this.root.querySelector(".terminal-output");
      this.input = this.root.querySelector(".terminal-input");
      this.print("Nebula Terminal v1.0\nВведите help, чтобы увидеть команды.\n", "success");
      this.on(this.input, "keydown", (event) => this.handleKey(event));
      setTimeout(() => this.input.focus(), 60);
    }

    handleKey(event) {
      if (event.key === "Enter") {
        const value = this.input.value.trim();
        this.print(`nebula@os:~$ ${value}`);
        this.input.value = "";
        if (value) {
          this.history.push(value);
          this.historyIndex = this.history.length;
        }
        this.execute(value);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.historyIndex = Math.max(0, this.historyIndex - 1);
        this.input.value = this.history[this.historyIndex] || "";
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
        this.input.value = this.history[this.historyIndex] || "";
      }
      if (event.key === "Tab") {
        event.preventDefault();
        this.autocomplete();
      }
    }

    autocomplete() {
      const value = this.input.value.trim();
      const parts = value.split(/\s+/);
      if (parts.length === 1) {
        const match = this.commands.find((command) => command.startsWith(value));
        if (match) this.input.value = match;
      }
    }

    execute(raw) {
      const [command, ...args] = raw.split(/\s+/);
      if (!command) return;
      const actions = {
        help: () => this.print([
          "Команды:",
          "  help, about, neofetch, clear, date",
          "  open [terminal|files|settings|monitor|calculator]",
          "  theme [dark|light|custom]",
          "  wallpaper [aurora|reef|sunset|grid]",
          "  apps, windows, ps, storage",
          "  notify [текст], tile, minimize, close, reset"
        ].join("\n")),
        about: () => this.print("Nebula OS v1.0\nСтатическая браузерная ОС: HTML5, CSS3, JavaScript, LocalStorage, Canvas, EventBus, Store, WindowManager."),
        neofetch: () => this.print([
          "        .-.",
          "   .--. /___\\  Nebula OS",
          "  /    \\|n n|  Kernel: Browser Runtime",
          `  \\    /\\_-_/  Theme: ${Nebula.store.getState().theme}`,
          `   '--'  / \\   Wallpaper: ${Nebula.store.getState().wallpaper}`,
          `              Windows: ${Nebula.store.getState().windows.length}`,
          "              Stack: HTML/CSS/JS only"
        ].join("\n"), "success"),
        clear: () => {
          this.output.innerHTML = "";
        },
        open: () => this.openApp(args[0]),
        theme: () => this.changeTheme(args[0]),
        wallpaper: () => this.changeWallpaper(args[0]),
        date: () => this.print(new Date().toLocaleString("ru-RU")),
        files: () => Nebula.bus.emit("app:open", "files"),
        apps: () => this.print("terminal\nfiles\nsettings\nmonitor\ncalculator"),
        windows: () => this.print(this.describeWindows()),
        ps: () => this.print(this.describeProcesses()),
        storage: () => this.print(this.describeStorage()),
        notify: () => {
          const message = args.join(" ") || "Тестовое уведомление из терминала";
          Nebula.notify.push("Terminal", message);
          this.print("Уведомление отправлено", "success");
        },
        tile: () => Nebula.windowManager.tileWindows(),
        minimize: () => Nebula.windowManager.minimizeActive(),
        close: () => Nebula.windowManager.closeActive(),
        reset: () => {
          Nebula.store.reset();
          Nebula.applyState();
          this.print("Настройки сброшены", "success");
        }
      };
      (actions[command] || (() => this.print(`Команда не найдена: ${command}`, "error")))();
    }

    describeWindows() {
      const windows = Nebula.windowManager.getSnapshot();
      if (!windows.length) return "Открытых окон нет";
      return windows.map((win, index) => `${index + 1}. ${win.title} [${win.app}] ${win.state}`).join("\n");
    }

    describeProcesses() {
      const windows = Nebula.windowManager.getSnapshot();
      const rows = ["PID    PROCESS              STATE", "0001   nebula-kernel        running", "0002   event-bus            running"];
      windows.forEach((win, index) => {
        rows.push(`${String(1000 + index).padEnd(6)} ${win.app.padEnd(20)} ${win.state}`);
      });
      return rows.join("\n");
    }

    describeStorage() {
      let bytes = 0;
      try {
        Object.keys(localStorage).forEach((key) => {
          bytes += key.length + localStorage.getItem(key).length;
        });
      } catch {
        return "Storage недоступен";
      }
      return `LocalStorage: ${bytes} chars\nTheme: ${Nebula.store.getState().theme}\nWallpaper: ${Nebula.store.getState().wallpaper}`;
    }

    openApp(app) {
      if (!Nebula.validators.isAppId(app)) {
        this.print("Использование: open terminal|files|settings|monitor|calculator", "error");
        return;
      }
      Nebula.bus.emit("app:open", app);
    }

    changeTheme(theme) {
      if (!Nebula.validators.isTheme(theme)) {
        this.print("Использование: theme dark|light|custom", "error");
        return;
      }
      Nebula.applyTheme(theme);
      this.print(`Тема изменена: ${theme}`, "success");
    }

    changeWallpaper(wallpaper) {
      if (!Nebula.validators.isWallpaper(wallpaper)) {
        this.print("Использование: wallpaper aurora|reef|sunset|grid", "error");
        return;
      }
      Nebula.applyWallpaper(wallpaper);
      this.print(`Обои изменены: ${wallpaper}`, "success");
    }

    print(text, type = "") {
      const line = document.createElement("div");
      line.className = type;
      line.textContent = text;
      this.output.append(line);
      this.output.scrollTop = this.output.scrollHeight;
    }
  }

  window.Nebula.TerminalApp = TerminalApp;
})();
