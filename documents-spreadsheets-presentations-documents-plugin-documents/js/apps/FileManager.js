(function () {
  "use strict";

  const FS_KEY = "nebula-os-fs";
  const defaultFs = {
    name: "root",
    type: "folder",
    children: [
      { name: "Desktop", type: "folder", children: [{ name: "welcome.txt", type: "file", size: "2 KB", content: "Добро пожаловать в Nebula OS.\nЭто виртуальный файл внутри LocalStorage." }] },
      { name: "Projects", type: "folder", children: [{ name: "nebula.md", type: "file", size: "8 KB", content: "# Nebula OS\nWindowManager + EventBus + Store + приложения." }] },
      { name: "system.log", type: "file", size: "14 KB", content: "[ok] kernel boot\n[ok] window-manager online\n[ok] storage mounted" }
    ]
  };

  function readFs() {
    try {
      return JSON.parse(localStorage.getItem(FS_KEY)) || JSON.parse(JSON.stringify(defaultFs));
    } catch {
      return JSON.parse(JSON.stringify(defaultFs));
    }
  }

  class FileManagerApp extends Nebula.Component {
    constructor(root) {
      super(root);
      this.fs = readFs();
      this.path = [];
      this.selected = null;
      this.render();
    }

    currentFolder() {
      return this.path.reduce((folder, name) => folder.children.find((child) => child.name === name), this.fs);
    }

    save() {
      localStorage.setItem(FS_KEY, JSON.stringify(this.fs));
    }

    render() {
      const folder = this.currentFolder();
      this.root.innerHTML = `
        <div class="app-toolbar">
          <button type="button" data-action="new">＋ Папка</button>
          <button type="button" data-action="file">＋ Файл</button>
          <button type="button" data-action="delete">− Удалить</button>
          <button type="button" data-action="home">⌂ Домой</button>
        </div>
        <section class="file-manager">
          <aside class="file-sidebar">
            <strong>Nebula FS</strong>
            <p class="muted">Виртуальная файловая система сохраняется локально.</p>
            <dl class="fs-stats">
              <dt>Папка</dt><dd>/${this.path.join("/") || "root"}</dd>
              <dt>Объектов</dt><dd>${folder.children.length}</dd>
              <dt>Выбрано</dt><dd>${this.selected || "нет"}</dd>
            </dl>
          </aside>
          <div>
            <nav class="breadcrumbs">${this.breadcrumbs()}</nav>
            <div class="file-list">${folder.children.map((item) => this.fileItem(item)).join("")}</div>
          </div>
          <aside class="info-panel">
            ${this.detailsPanel()}
          </aside>
        </section>
      `;
      this.bind();
    }

    breadcrumbs() {
      const crumbs = ["root", ...this.path];
      return crumbs.map((crumb, index) => `<button type="button" data-crumb="${index}">${Nebula.format.escapeHTML(crumb)}</button>`).join(" / ");
    }

    fileItem(item) {
      const icon = item.type === "folder" ? "▣" : "□";
      const info = item.type === "folder" ? "folder" : item.size || "1 KB";
      return `<div class="file-item ${this.selected === item.name ? "is-selected" : ""}" data-name="${Nebula.format.escapeHTML(item.name)}">
        <span>${icon}</span><span>${Nebula.format.escapeHTML(item.name)}</span><small>${info}</small>
      </div>`;
    }

    selectedItem() {
      if (!this.selected) return null;
      return this.currentFolder().children.find((item) => item.name === this.selected) || null;
    }

    detailsPanel() {
      const item = this.selectedItem();
      if (!item) {
        return `<strong>Инспектор</strong><p class="muted">Выберите файл или папку, чтобы увидеть метаданные.</p>`;
      }
      const children = item.type === "folder" ? `${item.children.length} объектов` : item.size || "1 KB";
      const preview = item.type === "file" ? `<pre>${Nebula.format.escapeHTML(item.content || "Пустой файл")}</pre>` : "<p class=\"muted\">Двойной клик откроет папку.</p>";
      return `
        <strong>${Nebula.format.escapeHTML(item.name)}</strong>
        <dl class="fs-stats">
          <dt>Тип</dt><dd>${item.type === "folder" ? "Папка" : "Файл"}</dd>
          <dt>Размер</dt><dd>${children}</dd>
          <dt>Путь</dt><dd>/${[...this.path, item.name].join("/")}</dd>
        </dl>
        ${preview}
      `;
    }

    bind() {
      this.root.querySelector("[data-action='new']").addEventListener("click", () => this.createFolder());
      this.root.querySelector("[data-action='file']").addEventListener("click", () => this.createFile());
      this.root.querySelector("[data-action='delete']").addEventListener("click", () => this.deleteSelected());
      this.root.querySelector("[data-action='home']").addEventListener("click", () => {
        this.path = [];
        this.render();
      });
      this.root.querySelectorAll("[data-crumb]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.crumb);
          this.path = this.path.slice(0, Math.max(0, index));
          this.selected = null;
          this.render();
        });
      });
      this.root.querySelectorAll(".file-item").forEach((item) => {
        item.addEventListener("click", () => {
          this.selected = item.dataset.name;
          this.render();
        });
        item.addEventListener("dblclick", () => this.open(item.dataset.name));
      });
    }

    open(name) {
      const item = this.currentFolder().children.find((child) => child.name === name);
      if (item?.type === "folder") {
        this.path.push(name);
        this.selected = null;
        this.render();
      } else if (item) {
        Nebula.notify.push("Файл", `${item.name} · ${item.size || "1 KB"}`);
      }
    }

    createFolder() {
      const folder = this.currentFolder();
      let index = folder.children.length + 1;
      let name = `New Folder ${index}`;
      while (folder.children.some((item) => item.name === name)) name = `New Folder ${++index}`;
      folder.children.push({ name, type: "folder", children: [] });
      this.save();
      this.render();
    }

    createFile() {
      const folder = this.currentFolder();
      let index = folder.children.length + 1;
      let name = `note-${index}.txt`;
      while (folder.children.some((item) => item.name === name)) name = `note-${++index}.txt`;
      folder.children.push({
        name,
        type: "file",
        size: "1 KB",
        content: `Nebula note ${index}\nСоздано: ${new Date().toLocaleString("ru-RU")}`
      });
      this.selected = name;
      this.save();
      this.render();
    }

    deleteSelected() {
      if (!this.selected) return;
      const folder = this.currentFolder();
      folder.children = folder.children.filter((item) => item.name !== this.selected);
      this.selected = null;
      this.save();
      this.render();
    }
  }

  window.Nebula.FileManagerApp = FileManagerApp;
})();
