(function () {
  "use strict";

  const glyphs = {
    terminal: "⌁",
    files: "▣",
    settings: "⚙",
    monitor: "▥",
    calculator: "＋"
  };

  class Taskbar {
    constructor({ quickLaunch, runningApps, clock, store, bus }) {
      this.quickLaunch = quickLaunch;
      this.runningApps = runningApps;
      this.clock = clock;
      this.store = store;
      this.bus = bus;
      this.apps = [
        { id: "terminal", title: "Терминал" },
        { id: "files", title: "Файлы" },
        { id: "settings", title: "Настройки" },
        { id: "monitor", title: "Монитор" },
        { id: "calculator", title: "Калькулятор" }
      ];
      this.renderQuickLaunch();
      this.store.subscribe(() => this.renderRunning());
      setInterval(() => this.tick(), 1000);
      this.tick();
    }

    renderQuickLaunch() {
      this.quickLaunch.innerHTML = "";
      this.apps.slice(0, 4).forEach((app) => {
        const button = document.createElement("button");
        button.type = "button";
        button.title = app.title;
        button.setAttribute("aria-label", `Открыть ${app.title}`);
        button.textContent = glyphs[app.id];
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
        button.innerHTML = `<span>${glyphs[win.app] || "□"}</span><span>${Nebula.format.escapeHTML(win.title)}</span>`;
        button.addEventListener("click", () => {
          if (win.minimized) this.bus.emit("window:restore", win.id);
          else this.bus.emit("window:focus", win.id);
        });
        this.runningApps.append(button);
      });
    }

    tick() {
      this.clock.textContent = Nebula.format.timeFormat.format(new Date());
    }
  }

  window.Nebula.Taskbar = Taskbar;
})();
