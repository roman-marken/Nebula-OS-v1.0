(function () {
  "use strict";

  class Component {
    constructor(root, props = {}) {
      this.root = root;
      this.props = props;
      this.cleanups = [];
    }

    on(target, event, handler, options) {
      target.addEventListener(event, handler, options);
      this.cleanups.push(() => target.removeEventListener(event, handler, options));
    }

    destroy() {
      this.cleanups.splice(0).forEach((cleanup) => cleanup());
      this.root?.remove();
    }
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.Component = Component;
})();
