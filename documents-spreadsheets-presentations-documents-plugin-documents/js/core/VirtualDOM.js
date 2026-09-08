(function () {
  "use strict";

  function h(tag, props = {}, children = []) {
    return { tag, props, children: Array.isArray(children) ? children : [children] };
  }

  function createElement(vnode) {
    if (typeof vnode === "string" || typeof vnode === "number") return document.createTextNode(String(vnode));
    const node = document.createElement(vnode.tag);
    Object.entries(vnode.props || {}).forEach(([key, value]) => {
      if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    });
    vnode.children.forEach((child) => node.append(createElement(child)));
    return node;
  }

  function mount(root, vnode) {
    root.replaceChildren(createElement(vnode));
  }

  window.Nebula = window.Nebula || {};
  window.Nebula.vdom = { h, createElement, mount };
})();
