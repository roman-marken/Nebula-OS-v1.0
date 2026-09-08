(function () {
  "use strict";

  function throttle(fn, limit = 80) {
    let locked = false;
    let latestArgs = null;
    return function throttled(...args) {
      latestArgs = args;
      if (locked) return;
      locked = true;
      requestAnimationFrame(() => {
        fn.apply(this, latestArgs);
        setTimeout(() => {
          locked = false;
        }, limit);
      });
    };
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.throttle = throttle;
})();
