(function () {
  "use strict";

  const STORAGE_KEY = "nebula-os-state";

  const defaults = Object.freeze({
    windows: [],
    activeWindow: null,
    theme: "dark",
    wallpaper: "aurora",
    settings: {
      transparency: 0.84,
      animations: true,
      sound: false
    },
    apps: {
      terminal: { running: false },
      files: { running: false },
      settings: { running: false },
      monitor: { running: false },
      calculator: { running: false }
    }
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(target, source) {
    const result = Array.isArray(target) ? [...target] : { ...target };
    Object.keys(source || {}).forEach((key) => {
      const value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = deepMerge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    });
    return result;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? deepMerge(defaults, JSON.parse(raw)) : clone(defaults);
    } catch (error) {
      console.warn("[Nebula Store] State recovery failed", error);
      return clone(defaults);
    }
  }

  function createStore(initialState) {
    const listeners = new Set();
    const state = initialState;
    const notify = () => listeners.forEach((listener) => listener(state));

    const api = {
      getState: () => state,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      set(path, value) {
        const keys = path.split(".");
        const last = keys.pop();
        const target = keys.reduce((node, key) => node[key], state);
        target[last] = value;
        notify();
        api.persist();
      },
      patch(partial) {
        Object.assign(state, deepMerge(state, partial));
        notify();
        api.persist();
      },
      persist() {
        try {
          const persistable = {
            theme: state.theme,
            wallpaper: state.wallpaper,
            settings: state.settings
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
        } catch (error) {
          console.warn("[Nebula Store] Persist failed", error);
        }
      },
      reset() {
        localStorage.removeItem(STORAGE_KEY);
        Object.assign(state, clone(defaults));
        notify();
      }
    };

    return api;
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.Store = { createStore, loadState, defaults };
})();
