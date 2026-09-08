(function () {
  "use strict";

  function debounce(fn, delay = 160) {
    let timer = 0;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.debounce = debounce;
})();
