import { Serializer } from "../rkgk/rkgk.js";

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
      buttonLabels = {
        ok: "Ok",
        cancel: "Cancel",
      },
      onClose,
    } = {},
  ) {
    this.title = title;
    if (uniqueWindows.has(this.title)) {
      this.skip = true;
      return;
    }
    if (makeUnique) {
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
    this.root.style.overflow = "auto";
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
    okBtn.textContent = buttonLabels.ok;
    okBtn.onclick = () => this.close(true);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = buttonLabels.cancel;
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
    this.el.addEventListener("pointerdown", (e) => {
      // HACK: drag "steals" mouse inputs, also click bubbles up to the parent
      // making clicking clickable components impossible when the parent is dragged
      const ignoredTags = ["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"];
      if (
        ignoredTags.includes(e.target.tagName) || e.target.closest("button")
      ) {
        return;
      }
      if (e.target === this.resizeHandle) return;
      this.dragging = true;
      this.offset.x = e.clientX - this.el.offsetLeft;
      this.offset.y = e.clientY - this.el.offsetTop;

      this.el.setPointerCapture(e.pointerId);
    });

    this.el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;

      this.el.style.left = `${e.clientX - this.offset.x}px`;
      this.el.style.top = `${e.clientY - this.offset.y}px`;
    });

    this.el.addEventListener("pointerup", (e) => {
      this.dragging = false;
      this.el.releasePointerCapture(e.pointerId);
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

  close(ok) {
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

/**
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function acceptWindow(title, message) {
  return new Promise((resolve, _) => {
    const accept = new FloatingWindow(document.body, {
      title,
      width: 420,
      showCancel: true,
      onClose: resolve,
      makeUnique: true,
    });

    accept.setContent((root) => {
      const txt = document.createElement("p");
      txt.innerText = message;
      root.appendChild(txt);
    });
  });
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
      <p><b>Pan</b>: Alt+Mouse or ↑, ↓, ←, →</p>
      <p><b>Zoom</b>: Alt+Scroll</p>
      <p><b>Reset</b>: Alt+R, or by <b>clicking</b> on the zoom value</p>
      <p><b>Undo/Redo</b>: Ctrl+Z/Ctrl+Y</p>
      <br/>
      <p><b>References</b>: you can <b>drag & drop</b> images to use as a reference</p>
    `;
    root.appendChild(txt);
  });
}

export function errorWindow(mainError = "Unknown error", details = []) {
  const stringifyError = (err) => {
    return typeof err == "string"
      ? err
      : (err?.message ?? err?.toString() ?? err);
  };

  const shortcuts = new FloatingWindow(document.body, {
    title: "An error has occured",
    width: 420,
    height: 420,
    showCancel: false,
    makeUnique: false,
  });

  shortcuts.setContent((root) => {
    const txt = document.createElement("div");
    txt.innerHTML = `
      <p><b>${stringifyError(mainError)}</b></p>
      <p>
        ${
      details.map((detail) => `<p> - ${stringifyError(detail)} </p>`).join("")
    }
      </p>
    `;
    root.appendChild(txt);
  });
}

export function flashElement(el, color, duration = 500) {
  const originalTransition = el.style.transition;
  const originalBackground = el.style.backgroundColor;

  el.style.transition = "none";
  el.style.backgroundColor = color;

  el.offsetHeight; // ! Tricks browser to force reflow so transition applies

  el.style.transition = `background-color ${duration}ms ease-out`;
  el.style.backgroundColor = originalBackground || "";

  setTimeout(() => {
    el.style.transition = originalTransition;
    el.style.backgroundColor = originalBackground || "";
  }, duration);
}

export function projectOptionsWindow(rkgk, requestUIReload) {
  const win = new FloatingWindow(document.body, {
    title: "Project options",
    width: 400,
    makeUnique: true,
    showCancel: false,
    buttonLabels: {
      ok: "Quit",
      cancel: "Cancel",
    },
  });

  win.setContent((root) => {
    const dim = rkgk.getDim();
    let aspectRatio = dim.width / dim.height;
    let lockAR = true;

    root.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">

      <!-- Title -->
      <div style="display:flex; flex-direction:column; gap:4px;">
        <label for="project_title">Project title</label>
        <input
          id="project_title"
          type="text"
          placeholder="Project title"
          value="${rkgk.title ?? "rkgk_untitled"}"
          style="width: 50%;"
        />
      </div>

      <!-- Resize -->
      <div style="display:flex; align-items:center; gap:6px;">
        <input id="width_input" type="number" value="${dim.width}" style="width:70px;" />
        <span>x</span>
        <input id="height_input" type="number" value="${dim.height}" style="width:70px;" />
        <button id="resize_btn">Resize</button>
      </div>

      <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
        <input id="lock_ar" type="checkbox" checked />
        Lock aspect ratio
      </label>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
        <input id="transparent" type="checkbox" checked />
        Keep transparency
      </label>

      <!-- Export meta -->
      <div style="display:flex; flex-direction:column; gap:4px;">
        <label for="key_input">Layer lock key (optional)</label>
        <input
          id="key_input"
          type="password"
          placeholder="Key (optional)"
          style="width: 80%;"
        />
      </div>

      <!-- Actions -->
      <div style="display:flex; gap:6px;">
        <button id="download_btn">Download</button>
        <button id="export_btn">Export</button>
        <button id="load_btn">Load</button>
      </div>

    </div>
  `;

    const titleInput = root.querySelector("#project_title");
    const widthInput = root.querySelector("#width_input");
    const heightInput = root.querySelector("#height_input");
    const lockARInput = root.querySelector("#lock_ar");
    const transparentInput = root.querySelector("#transparent");
    const keyInput = root.querySelector("#key_input");

    titleInput.oninput = () => {
      rkgk.title = titleInput.value;
    };
    titleInput.value = rkgk.title || titleInput.value;

    lockARInput.onchange = () => {
      lockAR = lockARInput.checked;
      if (lockAR) {
        const w = +widthInput.value;
        const h = +heightInput.value;
        if (w > 0 && h > 0) aspectRatio = w / h;
      }
    };

    widthInput.oninput = () => {
      if (!lockAR) return;
      const w = +widthInput.value;
      if (w > 0) {
        heightInput.value = Math.round(w / aspectRatio);
      }
    };

    heightInput.oninput = () => {
      if (!lockAR) return;
      const h = +heightInput.value;
      if (h > 0) {
        widthInput.value = Math.round(h * aspectRatio);
      }
    };

    root.querySelector("#resize_btn").onclick = async () => {
      const w = parseInt(widthInput.value, 10);
      const h = parseInt(heightInput.value, 10);
      if (!isNaN(w) && !isNaN(h)) {
        await rkgk.resize(w, h);
        aspectRatio = w / h;
      }
    };

    const getFilename = (placeholder = "rkgk_untitled") => {
      return rkgk.title || titleInput.value || placeholder;
    };

    root.querySelector("#download_btn").onclick = async () => {
      const { drawable: img } = await rkgk.getComposedImage(
        !!transparentInput.checked,
      );
      const a = document.createElement("a");
      a.href = img.src;
      a.download = getFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    root.querySelector("#export_btn").onclick = async () => {
      const sp = startSpin();
      try {
        console.log(keyInput, keyInput.value);
        const serializer = new Serializer(keyInput.value);
        const projectData = await serializer.serialize(rkgk);

        const blob = new Blob([projectData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${getFilename()}.rkgk`;
        document.body.appendChild(a);
        a.click();

        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Failed to export project:", err);
        errorWindow(err + "");
      } finally {
        sp.unload();
        win.close(true);
      }
    };

    root.querySelector("#load_btn").onclick = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".rkgk";
      input.style.display = "none";

      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;

        let errors = [];
        const sp = startSpin();
        try {
          const serializer = new Serializer(keyInput.value);
          errors = await serializer.from(rkgk, file);
          requestUIReload();
          win.close(true);
        } catch (err) {
          console.error("Failed to load project:", err);
          errors = [err];
        } finally {
          sp.unload();
          if (errors.length > 0) {
            errorWindow(
              `Failed loading project "${file.name}":`,
              errors,
            );
          }
        }
      });

      document.body.appendChild(input);
      input.click();
      input.remove();
    };
  });
}

/**
 * @param {File} file
//  * @param {DragEvent} position
 */
export function referenceWindow(file, position) {
  const url = URL.createObjectURL(file);
  const win = new FloatingWindow(document.body, {
    title: file.name,
    width: 400,
    height: null,
    x: position.clientX,
    y: position.clientY,
    showCancel: false,
    makeUnique: true,
    buttonLabels: {
      ok: "Quit",
      cancel: "Cancel",
    },
  });

  win.setContent((root) => {
    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.display = "block";

    // Disable ability to drag and drop inner images
    // otherwise we can trigger unwanted accidental dup windows
    img.draggable = false;

    root.appendChild(img);
  });
}

export function startSpin() {
  const target = document.documentElement; // Root <html> element
  target.classList.add("is-loading");

  return {
    unload: () => {
      target.classList.remove("is-loading");
    },
  };
}
