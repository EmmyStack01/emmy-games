// TEST-ONLY. A tiny stand-in for the browser's DOM: just enough for the real MissionUI (and the
// real MissionSystem, which builds it) to run in Node, so taps, key presses, hidden/visible
// states and text can be tested on the REAL UI code. No dependency is used.
// It supports only what MissionUI uses: elements, className, classList, dataset, attributes,
// append / appendChild / insertBefore / remove / contains / closest, simple querySelector
// ("#id", ".class", ".class:not([hidden])"), click bubbling, focus / blur, and window key events.

export class FakeElement {
  constructor(tag, owner) {
    this.tagName = tag.toUpperCase();
    this.owner = owner; // the fake document
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.hidden = false;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.type = '';
    this.style = {};
    this.offsetWidth = 0;
    this.classList = {
      add: (name) => {
        if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim();
      },
      remove: (name) => {
        this.className = this.className.split(/\s+/).filter((c) => c && c !== name).join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
    node.parentNode = this;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }

  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }

  contains(node) {
    return node === this || this.children.some((c) => c.contains(node));
  }

  matches(selector) {
    const notHidden = selector.endsWith(':not([hidden])');
    const base = notHidden ? selector.slice(0, -':not([hidden])'.length) : selector;
    if (notHidden && this.hidden) return false;
    if (base.startsWith('#')) return this.id === base.slice(1);
    if (base.startsWith('.')) return this.classList.contains(base.slice(1));
    if (base === 'button[data-action]') return this.tagName === 'BUTTON' && 'action' in this.dataset;
    return this.tagName.toLowerCase() === base;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (node.matches(selector)) return node;
    }
    return null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  // A click on this element, which bubbles up to its parents (like a real one).
  click() {
    const event = { type: 'click', target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (let node = this; node; node = node.parentNode) {
      node.listeners.get('click')?.forEach((handler) => handler(event));
    }
    return event;
  }

  focus() {
    this.owner.activeElement = this;
  }

  blur() {
    if (this.owner.activeElement === this) this.owner.activeElement = null;
  }
}

// Installs a fake `document` and `window`, with the #app / #hud / #hud-message the game page has.
// Call restore() when finished.
export function installFakeDom() {
  const windowListeners = new Map();
  const doc = {
    activeElement: null,
    createElement: (tag) => new FakeElement(tag, doc),
    getElementById: (id) => doc.body.querySelector(`#${id}`),
  };
  doc.body = new FakeElement('body', doc);

  const app = doc.createElement('div');
  app.id = 'app';
  const hud = doc.createElement('div');
  hud.id = 'hud';
  const message = doc.createElement('p');
  message.id = 'hud-message';
  hud.appendChild(message);
  app.appendChild(hud);
  doc.body.appendChild(app);

  const win = {
    addEventListener: (type, handler) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => windowListeners.get(type)?.delete(handler),
    listenerCount: (type) => windowListeners.get(type)?.size ?? 0,
  };

  const saved = { document: globalThis.document, window: globalThis.window };
  globalThis.document = doc;
  globalThis.window = win;

  return {
    document: doc,
    window: win,
    app,
    hud,
    // Presses a key: `init` is like a real KeyboardEvent (key, repeat, ctrlKey, altKey, metaKey ...).
    keydown(init) {
      const event = {
        type: 'keydown',
        repeat: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: false,
        isComposing: false,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...init,
      };
      windowListeners.get('keydown')?.forEach((handler) => handler(event));
      return event;
    },
    restore() {
      if (saved.document === undefined) delete globalThis.document;
      else globalThis.document = saved.document;
      if (saved.window === undefined) delete globalThis.window;
      else globalThis.window = saved.window;
    },
  };
}
