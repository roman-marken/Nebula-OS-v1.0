(function () {
  "use strict";

  function memoize(fn) {
    const cache = new Map();
    return (...args) => {
      const key = JSON.stringify(args);
      if (!cache.has(key)) cache.set(key, fn(...args));
      return cache.get(key);
    };
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.memoize = memoize;
})();
