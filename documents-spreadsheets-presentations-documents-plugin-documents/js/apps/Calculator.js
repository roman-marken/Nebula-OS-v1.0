(function () {
  "use strict";

  class CalculatorApp extends Nebula.Component {
    constructor(root) {
      super(root);
      this.value = "0";
      this.render();
    }

    render() {
      const buttons = ["C", "⌫", "%", "/", "7", "8", "9", "*", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="];
      this.root.innerHTML = `
        <section class="calculator">
          <input class="calc-display" value="${this.value}" readonly aria-label="Результат">
          <div class="calc-grid">${buttons.map((button) => `<button class="calc-button" type="button" data-key="${button}">${button}</button>`).join("")}</div>
        </section>
      `;
      this.root.querySelectorAll("[data-key]").forEach((button) => {
        button.addEventListener("click", () => this.press(button.dataset.key));
      });
    }

    press(key) {
      if (key === "C") this.value = "0";
      else if (key === "⌫") this.value = this.value.length > 1 ? this.value.slice(0, -1) : "0";
      else if (key === "=") this.calculate();
      else this.value = this.value === "0" ? key : `${this.value}${key}`;
      this.root.querySelector(".calc-display").value = this.value;
    }

    calculate() {
      try {
        if (!/^[0-9+\-*/%. ()]+$/.test(this.value)) throw new Error("Unsafe expression");
        this.value = String(Function(`"use strict"; return (${this.value})`)());
      } catch {
        this.value = "Error";
      }
    }
  }

  window.Nebula.CalculatorApp = CalculatorApp;
})();
