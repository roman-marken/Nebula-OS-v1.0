(function () {
  "use strict";

  class NotificationCenter {
    constructor(root) {
      this.root = root;
      this.queue = [];
      this.visible = 0;
      this.maxVisible = 4;
    }

    push(title, message, timeout = 3600) {
      this.queue.push({ title, message, timeout });
      this.playSound();
      this.flush();
    }

    playSound() {
      if (!window.Nebula?.store?.getState().settings.sound) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 740;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.16);
        setTimeout(() => ctx.close(), 220);
      } catch (error) {
        console.warn("[Nebula Notification] Sound failed", error);
      }
    }

    flush() {
      while (this.visible < this.maxVisible && this.queue.length) {
        const item = this.queue.shift();
        const toast = document.createElement("article");
        toast.className = "toast";
        toast.innerHTML = `<h3>${Nebula.format.escapeHTML(item.title)}</h3><p>${Nebula.format.escapeHTML(item.message)}</p>`;
        this.root.append(toast);
        this.visible += 1;
        setTimeout(() => this.remove(toast), item.timeout);
      }
    }

    remove(toast) {
      toast.classList.add("is-leaving");
      setTimeout(() => {
        toast.remove();
        this.visible = Math.max(0, this.visible - 1);
        this.flush();
      }, 190);
    }
  }

  window.Nebula.NotificationCenter = NotificationCenter;
})();
