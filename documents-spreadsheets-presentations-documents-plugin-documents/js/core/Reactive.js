(function () {
  "use strict";

  /**
   * Tiny Proxy observer for demo widgets that need local reactivity.
   */
  function reactive(target, onChange) {
    return new Proxy(target, {
      set(obj, prop, value) {
        Reflect.set(obj, prop, value);
        onChange?.(prop, value, obj);
        return true;
      }
    });
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.reactive = reactive;
})();
