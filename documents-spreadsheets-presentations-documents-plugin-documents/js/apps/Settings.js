(function () {
  "use strict";

  class SettingsApp extends Nebula.Component {
    constructor(root) {
      super(root);
      this.render();
    }

    render() {
      const state = Nebula.store.getState();
      this.root.innerHTML = `
        <section class="settings-panel">
          <div class="settings-summary">
            <div><strong>${state.theme}</strong><span>Тема</span></div>
            <div><strong>${state.wallpaper}</strong><span>Обои</span></div>
            <div><strong>${Math.round(state.settings.transparency * 100)}%</strong><span>Окна</span></div>
          </div>
          <label class="setting-row">
            <span>Тема</span>
            <select data-setting="theme">
              ${["dark", "light", "custom"].map((theme) => `<option value="${theme}" ${state.theme === theme ? "selected" : ""}>${theme}</option>`).join("")}
            </select>
          </label>
          <label class="setting-row">
            <span>Обои</span>
            <select data-setting="wallpaper">
              ${["aurora", "reef", "sunset", "grid"].map((wallpaper) => `<option value="${wallpaper}" ${state.wallpaper === wallpaper ? "selected" : ""}>${wallpaper}</option>`).join("")}
            </select>
          </label>
          <label class="setting-row">
            <span>Прозрачность</span>
            <input data-setting="transparency" type="range" min="0.68" max="1" step="0.02" value="${state.settings.transparency}">
          </label>
          <label class="setting-row">
            <span>Анимации</span>
            <input data-setting="animations" type="checkbox" ${state.settings.animations ? "checked" : ""}>
          </label>
          <label class="setting-row">
            <span>Звук</span>
            <input data-setting="sound" type="checkbox" ${state.settings.sound ? "checked" : ""}>
          </label>
          <div class="app-toolbar">
            <button type="button" data-action="reset">↻ Сбросить</button>
            <button type="button" data-action="toast">◌ Тест уведомления</button>
          </div>
        </section>
      `;
      this.bind();
    }

    bind() {
      this.root.querySelector("[data-setting='theme']").addEventListener("change", (event) => Nebula.applyTheme(event.target.value));
      this.root.querySelector("[data-setting='wallpaper']").addEventListener("change", (event) => Nebula.applyWallpaper(event.target.value));
      this.root.querySelector("[data-setting='transparency']").addEventListener("input", (event) => {
        const value = Number(event.target.value);
        Nebula.store.set("settings.transparency", value);
        document.body.style.setProperty("--window-alpha", value);
      });
      this.root.querySelector("[data-setting='animations']").addEventListener("change", (event) => {
        Nebula.store.set("settings.animations", event.target.checked);
        Nebula.applyMotionPreference(event.target.checked);
        this.render();
      });
      this.root.querySelector("[data-setting='sound']").addEventListener("change", (event) => {
        Nebula.store.set("settings.sound", event.target.checked);
        Nebula.notify.push("Настройки", event.target.checked ? "Звук включён" : "Звук выключен");
        this.render();
      });
      this.root.querySelector("[data-action='reset']").addEventListener("click", () => {
        Nebula.store.reset();
        Nebula.applyState();
        Nebula.notify.push("Настройки", "Параметры сброшены");
        this.render();
      });
      this.root.querySelector("[data-action='toast']").addEventListener("click", () => {
        Nebula.notify.push("Nebula OS", "Уведомления работают корректно");
      });
    }
  }

  window.Nebula.SettingsApp = SettingsApp;
})();
