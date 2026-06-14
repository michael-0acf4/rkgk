const CODE_LOOKUP = (() => {
  const m = {};
  for (let i = 0; i < 10; i++) m["Digit" + i] = "" + i;
  for (let i = 0; i < 26; i++) {
    m["Key" + String.fromCharCode(65 + i)] = String.fromCharCode(97 + i);
  }
  m["BracketLeft"] = "[";
  m["BracketRight"] = "]";
  m["Backslash"] = "\\";
  m["Comma"] = ",";
  m["Period"] = ".";
  m["Slash"] = "/";
  m["Semicolon"] = ";";
  m["Quote"] = "'";
  m["Backquote"] = "`";
  m["Minus"] = "-";
  m["Equal"] = "=";
  m["Space"] = " ";
  m["Enter"] = "enter";
  m["Tab"] = "tab";
  m["Escape"] = "escape";
  m["Backspace"] = "backspace";
  m["Delete"] = "delete";
  m["ArrowUp"] = "arrowup";
  m["ArrowDown"] = "arrowdown";
  m["ArrowLeft"] = "arrowleft";
  m["ArrowRight"] = "arrowright";
  return m;
})();

function codeToKey(code) {
  return CODE_LOOKUP[code] ?? "";
}

export class KeyboardShortcutRegistry {
  #handler;

  constructor() {
    this.bindings = [];
    this.#handler = (e) => this.#onKeyDown(e);
    window.addEventListener("keydown", this.#handler);
  }

  add(def, handler) {
    this.bindings.push({
      key: def.key.toLowerCase(),
      alt: def.alt ?? false,
      ctrl: def.ctrl ?? false,
      shift: def.shift ?? false,
      meta: def.meta ?? false,
      handler,
      def,
    });
  }

  #onKeyDown(e) {
    if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
    if (e.target.closest("textarea, select, [contenteditable]")) return;
    const key = e.key.toLowerCase();
    const codeKey = codeToKey(e.code);
    for (const b of this.bindings) {
      if (
        (b.key === key || (codeKey && b.key === codeKey)) &&
        b.alt === e.altKey &&
        b.ctrl === (e.ctrlKey || e.metaKey) &&
        b.shift === e.shiftKey
      ) {
        e.preventDefault();
        b.handler(e, b.def);
        return;
      }
    }
  }

  destroy() {
    window.removeEventListener("keydown", this.#handler);
    this.bindings = [];
  }
}
