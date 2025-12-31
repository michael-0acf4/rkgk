const uniqueWindows = new Set();

export class FloatingWindow {
  constructor(
    root = document.body,
    {
      title = "",
      x = null,
      y = null,
      width = 300,
      height = null,
      showCancel = true,
      makeUnique = false,
      onClose,
    } = {},
  ) {
    this.title = title;
    if (uniqueWindows.has(this.title)) {
      console.warn("Window marked as unique");
      this.skip = true;
      return;
    }
    if (makeUnique) {
      console.log("make unique");
      uniqueWindows.add(this.title);
    }

    this.root = root;
    this.dragging = false;
    this.resizing = false;
    this.offset = { x: 0, y: 0 };
    this.onClose = onClose;

    this.el = document.createElement("div");
    this.el.className = "floating-window";
    this.el.style.width = width + "px";
    if (height) {
      this.el.style.height = height + "px";
    }
    this.el.style.position = "fixed";

    const offset = 15; // pixels to offset from cursor
    this.el.style.left = x != null
      ? `${x + offset}px`
      : `${(window.innerWidth - width) / 2}px`;

    this.el.style.top = y != null ? `${y + offset}px` : "80px";
    this.el.style.zIndex = 1000;

    this.header = document.createElement("div");
    this.header.className = "floating-window-header";

    const titleEl = document.createElement("span");
    titleEl.className = "floating-window-title";
    titleEl.textContent = title;
    this.header.appendChild(titleEl);

    this.content = document.createElement("div");
    this.content.className = "floating-window-content";

    this.footer = document.createElement("div");
    this.footer.className = "floating-window-footer";

    const okBtn = document.createElement("button");
    okBtn.textContent = "Ok";
    okBtn.onclick = () => this.#close(true);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => this.#close(false);

    this.footer.appendChild(okBtn);
    if (showCancel) {
      this.footer.appendChild(cancelBtn);
    }

    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "floating-window-resize-handle";
    this.el.appendChild(this.resizeHandle);

    this.el.appendChild(this.header);
    this.el.appendChild(this.content);
    this.el.appendChild(this.footer);
    this.root.appendChild(this.el);

    this.#bindDrag();
    this.#bindResize();
  }

  setContent(fn) {
    if (this.skip) {
      return;
    }

    this.content.innerHTML = "";
    fn(this.content);
  }

  #bindDrag() {
    this.header.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.offset.x = e.clientX - this.el.offsetLeft;
      this.offset.y = e.clientY - this.el.offsetTop;
      this.header.setPointerCapture(e.pointerId);
    });

    this.header.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.el.style.left = `${e.clientX - this.offset.x}px`;
      this.el.style.top = `${e.clientY - this.offset.y}px`;
    });

    this.header.addEventListener("pointerup", (e) => {
      this.dragging = false;
      this.header.releasePointerCapture(e.pointerId);
    });
  }

  #bindResize() {
    this.resizeHandle.addEventListener("pointerdown", (e) => {
      this.resizing = true;
      this.offset.x = e.clientX;
      this.offset.y = e.clientY;
      this.resizeHandle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    this.resizeHandle.addEventListener("pointermove", (e) => {
      if (!this.resizing) return;
      const dx = e.clientX - this.offset.x;
      const dy = e.clientY - this.offset.y;
      const rect = this.el.getBoundingClientRect();
      this.el.style.width = rect.width + dx + "px";
      this.el.style.height = rect.height + dy + "px";
      this.offset.x = e.clientX;
      this.offset.y = e.clientY;
    });

    this.resizeHandle.addEventListener("pointerup", (e) => {
      this.resizing = false;
      this.resizeHandle.releasePointerCapture(e.pointerId);
    });
  }

  #close(ok) {
    this.el.remove();
    this.onClose?.(ok);
    uniqueWindows.delete(this.title);
  }
}

export function createSpacer(width = 8) {
  const spacer = document.createElement("div");
  spacer.style.width = width + "px";
  spacer.style.height = "1px";
  spacer.style.flexShrink = "0";
  return spacer;
}

export function helpWindow() {
  const shortcuts = new FloatingWindow(document.body, {
    title: "Help",
    width: 420,
    showCancel: false,
    makeUnique: true,
  });

  shortcuts.setContent((root) => {
    const txt = document.createElement("div");
    txt.innerHTML = `
      <p><b>Pan</b>: Alt+Mouse or Up, Down, Left, Right</p>
      <p><b>Zoom</b>: Alt+Scroll</p>
      <p><b>Reset</b>: Alt+R, or by *clicking* on the zoom value</p>
      <p><b>Undo/Redo</b>: Ctrl+Z/Ctrl+Y</p>
      <br/>
      <p><b>References</b>: you can <b>drag & drop</b> images to use as a reference</p>
    `;
    root.appendChild(txt);
  });
}

export function projectOptionsWindow(rkgk) {
  const win = new FloatingWindow(document.body, {
    title: "Project options",
    width: 400,
    makeUnique: true,
    showCancel: false,
  });

  win.setContent((root) => {
    const resizeRow = document.createElement("div");
    resizeRow.style.display = "flex";
    resizeRow.style.alignItems = "center";
    resizeRow.style.gap = "6px";
    resizeRow.style.marginBottom = "8px";

    const dim = rkgk.getDim();

    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.value = dim.width;
    widthInput.style.width = "60px";

    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.value = dim.height;
    heightInput.style.width = "60px";

    const resizeBtn = document.createElement("button");
    resizeBtn.textContent = "Resize";
    resizeBtn.onclick = () => {
      const w = parseInt(widthInput.value, 10);
      const h = parseInt(heightInput.value, 10);
      if (!isNaN(w) && !isNaN(h)) rkgk.resize(w, h);
    };

    resizeRow.appendChild(widthInput);
    resizeRow.appendChild(heightInput);
    resizeRow.appendChild(resizeBtn);

    // Export
    const exportRow = document.createElement("div");
    exportRow.style.display = "flex";
    exportRow.style.gap = "6px";

    const pwInput = document.createElement("input");
    pwInput.type = "password";
    pwInput.size = 25;
    pwInput.placeholder = "Key (optional)";

    const exportImageBtn = document.createElement("button");
    exportImageBtn.textContent = "Download image";
    exportImageBtn.onclick = () => {
      alert("Export image triggered!");
    };

    const exportProjectBtn = document.createElement("button");
    exportProjectBtn.textContent = "Export .rkgk";
    exportProjectBtn.onclick = () => {
      alert("Export project triggered!");
    };

    const loadProjectBtn = document.createElement("button");
    loadProjectBtn.textContent = "Load .rkgk";
    loadProjectBtn.onclick = () => {
      alert("Export project triggered!");
    };

    exportRow.appendChild(pwInput);
    exportRow.appendChild(exportImageBtn);
    exportRow.appendChild(exportProjectBtn);
    exportRow.appendChild(loadProjectBtn);

    root.appendChild(resizeRow);
    root.appendChild(exportRow);
  });
}
