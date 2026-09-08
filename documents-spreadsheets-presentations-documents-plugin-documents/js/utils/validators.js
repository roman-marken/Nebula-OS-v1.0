(function () {
  "use strict";

  function isAppId(value) {
    return ["terminal", "files", "settings", "monitor", "calculator"].includes(value);
  }

  function isTheme(value) {
    return ["dark", "light", "custom"].includes(value);
  }

  function isWallpaper(value) {
    return ["aurora", "reef", "sunset", "grid"].includes(value);
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.validators = { isAppId, isTheme, isWallpaper };
})();
