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
      onClose,
    } = {},
  ) {
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
    okBtn.onclick = () => this.close(true);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => this.close(false);

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

    this.bindDrag();
    this.bindResize();
  }

  setContent(fn) {
    this.content.innerHTML = "";
    fn(this.content);
  }

  bindDrag() {
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

  bindResize() {
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

  close(ok) {
    this.el.remove();
    this.onClose?.(ok);
  }
}
