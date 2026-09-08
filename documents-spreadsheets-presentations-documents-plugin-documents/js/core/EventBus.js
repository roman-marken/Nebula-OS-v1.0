(function () {
  "use strict";

  /**
   * Lightweight pub/sub used by all Nebula OS modules.
   */
  class EventBus {
    constructor() {
      this.events = new Map();
    }

    on(eventName, handler) {
      if (!this.events.has(eventName)) this.events.set(eventName, new Set());
      this.events.get(eventName).add(handler);
      return () => this.off(eventName, handler);
    }

    off(eventName, handler) {
      this.events.get(eventName)?.delete(handler);
    }

    emit(eventName, payload) {
      this.events.get(eventName)?.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[Nebula EventBus] ${eventName}`, error);
        }
      });
    }
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.EventBus = EventBus;
  window.Nebula.bus = new EventBus();
})();
