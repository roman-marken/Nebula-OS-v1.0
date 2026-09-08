(function () {
  "use strict";

  class ContextMenu {
    constructor(root) {
      this.root = root;
      document.addEventListener("click", () => this.hide());
      window.addEventListener("blur", () => this.hide());
    }

    show(x, y, items) {
      this.root.innerHTML = "";
      items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.label;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          this.hide();
          item.action?.();
        });
        this.root.append(button);
      });

      const maxX = window.innerWidth - 210;
      const maxY = window.innerHeight - items.length * 42 - 20;
      this.root.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
      this.root.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
      this.root.classList.add("is-open");
      this.root.setAttribute("aria-hidden", "false");
    }

    hide() {
      this.root.classList.remove("is-open");
      this.root.setAttribute("aria-hidden", "true");
    }
  }

  window.Nebula.ContextMenu = ContextMenu;
})();
