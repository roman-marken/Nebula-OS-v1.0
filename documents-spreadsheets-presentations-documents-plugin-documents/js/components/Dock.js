(function () {
  "use strict";

  class Dock {
    constructor(taskbar) {
      this.taskbar = taskbar;
    }

    focus(appId) {
      Nebula.bus.emit("app:open", appId);
    }
  }

  window.Nebula.Dock = Dock;
})();
