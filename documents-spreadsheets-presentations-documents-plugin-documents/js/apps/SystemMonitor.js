(function () {
  "use strict";

  class SystemMonitorApp extends Nebula.Component {
    constructor(root) {
      super(root);
      this.cpu = Array.from({ length: 36 }, () => 20 + Math.random() * 25);
      this.mem = Array.from({ length: 36 }, () => 40 + Math.random() * 20);
      this.render();
      this.interval = setInterval(() => this.tick(), 900);
      this.cleanups.push(() => clearInterval(this.interval));
    }

    render() {
      this.root.innerHTML = `
        <section class="monitor-app">
          <div class="monitor-grid">
            <article class="chart-panel"><strong>CPU</strong><canvas data-chart="cpu" width="320" height="130"></canvas></article>
            <article class="chart-panel"><strong>Memory</strong><canvas data-chart="mem" width="320" height="130"></canvas></article>
          </div>
          <table class="process-list">
            <thead><tr><th>PID</th><th>Процесс</th><th>Статус</th></tr></thead>
            <tbody data-processes></tbody>
          </table>
        </section>
      `;
      this.cpuCanvas = this.root.querySelector("[data-chart='cpu']");
      this.memCanvas = this.root.querySelector("[data-chart='mem']");
      this.processes = this.root.querySelector("[data-processes]");
      this.tick();
    }

    tick() {
      this.cpu.push(18 + Math.random() * 72);
      this.mem.push(34 + Math.random() * 54);
      this.cpu.shift();
      this.mem.shift();
      this.draw(this.cpuCanvas, this.cpu, "#29d3c2");
      this.draw(this.memCanvas, this.mem, "#ff5ea8");
      const latestCpu = this.cpu[this.cpu.length - 1];
      const latestMem = this.mem[this.mem.length - 1];
      document.getElementById("miniCpu").value = latestCpu;
      document.getElementById("miniRam").value = latestMem;
      this.renderProcesses();
    }

    draw(canvas, values, color) {
      const ctx = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 1;
      for (let y = 20; y < height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - (value / 100) * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    renderProcesses() {
      const rows = Nebula.store.getState().windows.map((win, index) => `
        <tr><td>${1000 + index}</td><td>${Nebula.format.escapeHTML(win.title)}</td><td>${win.minimized ? "sleep" : "running"}</td></tr>
      `);
      this.processes.innerHTML = rows.join("") || "<tr><td>0</td><td>kernel</td><td>idle</td></tr>";
    }
  }

  window.Nebula.SystemMonitorApp = SystemMonitorApp;
})();
