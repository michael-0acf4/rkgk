export class TransformTool {
  #handlePointerDown = (e) => {
    const p = this.#getCanvasPoint(e);
    const corner = this.#hitCorner(p.x, p.y);
    if (corner) {
      this.dragging = true;
      this.dragMode = "scale";
      this.dragStart = { x: p.x, y: p.y };
      this.dragStartState = { scale: this.scale };
      return;
    }
    if (this.#hitRotate(p.x, p.y)) {
      this.dragging = true;
      this.dragMode = "rotate";
      this.dragStart = { x: p.x, y: p.y };
      this.dragStartState = { rotation: this.rotation };
      return;
    }
    if (this.#hitImage(p.x, p.y)) {
      this.dragging = true;
      this.dragMode = "move";
      this.dragStart = { x: p.x, y: p.y };
      this.dragStartState = { pos: { ...this.pos } };
    }
  };

  #handlePointerMove = (e) => {
    if (!this.dragging) {
      this.#updateCursor(e);
      return;
    }
    const p = this.#getCanvasPoint(e);

    if (this.dragMode === "move") {
      this.pos.x = this.dragStartState.pos.x + (p.x - this.dragStart.x);
      this.pos.y = this.dragStartState.pos.y + (p.y - this.dragStart.y);
    } else if (this.dragMode === "scale") {
      const sd = Math.sqrt(
        (this.dragStart.x - this.pos.x) ** 2 +
          (this.dragStart.y - this.pos.y) ** 2,
      );
      const cd = Math.sqrt(
        (p.x - this.pos.x) ** 2 + (p.y - this.pos.y) ** 2,
      );
      if (sd > 0) {
        this.scale = Math.max(0.02, this.dragStartState.scale * (cd / sd));
      }
    } else if (this.dragMode === "rotate") {
      const sa = Math.atan2(
        this.dragStart.y - this.pos.y,
        this.dragStart.x - this.pos.x,
      );
      const ca = Math.atan2(p.y - this.pos.y, p.x - this.pos.x);
      this.rotation = this.dragStartState.rotation + (ca - sa);
    }
  };

  #handlePointerUp = () => {
    this.dragging = false;
    this.dragMode = null;
  };

  #handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
    }
  };

  constructor(rkgk, imageBitmap, { onConfirm, onCancel } = {}) {
    this.rkgk = rkgk;
    this.image = imageBitmap;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    const mainCanvas = rkgk.renderer.canvas;
    this.cw = mainCanvas.width;
    this.ch = mainCanvas.height;
    this.imgW = imageBitmap.width;
    this.imgH = imageBitmap.height;

    const fitScale = Math.min(
      (this.cw * 0.8) / this.imgW,
      (this.ch * 0.8) / this.imgH,
    );

    this.pos = { x: this.cw / 2, y: this.ch / 2 };
    this.scale = fitScale;
    this.rotation = 0;

    this.dragging = false;
    this.dragMode = null;
    this.dragStart = { x: 0, y: 0 };
    this.dragStartState = null;

    this.controls = null;
    this.running = false;

    this.#createCanvas(mainCanvas);
    this.#createControls();
    this.#bindEvents();

    this.running = true;
    this.#renderLoop();
  }

  #createCanvas(mainCanvas) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.cw;
    this.canvas.height = this.ch;
    this.canvas.style.cssText = `
      position: absolute; top: 0; left: 0;
      pointer-events: auto; cursor: default;
      transform-origin: 0 0;
    `;

    const stage = document.getElementById("canvasStage");
    stage.appendChild(this.canvas);

    this.mainCanvas = mainCanvas;
    this.#syncTransform();
    this.observer = new MutationObserver(() => this.#syncTransform());
    this.observer.observe(mainCanvas, {
      attributes: true,
      attributeFilter: ["style"],
    });

    mainCanvas.style.pointerEvents = "none";
    mainCanvas.style.cursor = "default";
  }

  #syncTransform() {
    this.canvas.style.transform = this.mainCanvas.style.transform;
  }

  #getScreenScale() {
    const s = this.mainCanvas.style.transform;
    const m = s.match(/scale\(([\d.]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  }

  #getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const ss = this.#getScreenScale();
    return {
      x: (e.clientX - rect.left) / ss,
      y: (e.clientY - rect.top) / ss,
    };
  }

  get corners() {
    const { cos, sin } = this.#trig();
    const hw = (this.imgW * this.scale) / 2;
    const hh = (this.imgH * this.scale) / 2;
    return {
      tl: {
        x: this.pos.x + (-hw * cos - -hh * sin),
        y: this.pos.y + (-hw * sin + -hh * cos),
      },
      tr: {
        x: this.pos.x + (hw * cos - -hh * sin),
        y: this.pos.y + (hw * sin + -hh * cos),
      },
      br: {
        x: this.pos.x + (hw * cos - hh * sin),
        y: this.pos.y + (hw * sin + hh * cos),
      },
      bl: {
        x: this.pos.x + (-hw * cos - hh * sin),
        y: this.pos.y + (-hw * sin + hh * cos),
      },
    };
  }

  get rotHandlePos() {
    const { sin, cos } = this.#trig();
    const hh = (this.imgH * this.scale) / 2;
    const off = 40;
    return {
      x: this.pos.x + (hh + off) * sin,
      y: this.pos.y - (hh + off) * cos,
    };
  }

  get topCenter() {
    const c = this.corners;
    return { x: (c.tl.x + c.tr.x) / 2, y: (c.tl.y + c.tr.y) / 2 };
  }

  #trig() {
    return { cos: Math.cos(this.rotation), sin: Math.sin(this.rotation) };
  }

  #renderLoop() {
    if (!this.running) return;
    this.#render();
    requestAnimationFrame(() => this.#renderLoop());
  }

  #render() {
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, this.cw, this.ch);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, this.cw, this.ch);

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale, this.scale);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "white";
    ctx.fillRect(-this.imgW / 2, -this.imgH / 2, this.imgW, this.imgH);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 16;
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(this.image, -this.imgW / 2, -this.imgH / 2);
    ctx.restore();

    const c = this.corners;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(c.tl.x, c.tl.y);
    ctx.lineTo(c.tr.x, c.tr.y);
    ctx.lineTo(c.br.x, c.br.y);
    ctx.lineTo(c.bl.x, c.bl.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    const rh = this.rotHandlePos;
    const tc = this.topCenter;
    ctx.beginPath();
    ctx.moveTo(tc.x, tc.y);
    ctx.lineTo(rh.x, rh.y);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    const ss = this.#getScreenScale();
    const r = 8 / ss;

    for (const key of ["tl", "tr", "br", "bl"]) {
      const p = c[key];
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 2 / ss;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(rh.x, rh.y, r * 1.25, 0, Math.PI * 2);
    ctx.fillStyle = "#4fc3f7";
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2 / ss;
    ctx.stroke();
  }

  #hitCorner(cx, cy) {
    const c = this.corners;
    const ss = this.#getScreenScale();
    const hitR = 16 / ss;
    for (const [key, p] of Object.entries(c)) {
      const dx = cx - p.x;
      const dy = cy - p.y;
      if (dx * dx + dy * dy < hitR * hitR) return key;
    }
    return null;
  }

  #hitRotate(cx, cy) {
    const p = this.rotHandlePos;
    const ss = this.#getScreenScale();
    const hitR = 20 / ss;
    const dx = cx - p.x;
    const dy = cy - p.y;
    return dx * dx + dy * dy < hitR * hitR;
  }

  #hitImage(cx, cy) {
    const dx = cx - this.pos.x;
    const dy = cy - this.pos.y;
    const { cos, sin } = this.#trig();
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const hw = (this.imgW * this.scale) / 2;
    const hh = (this.imgH * this.scale) / 2;
    return Math.abs(lx) < hw && Math.abs(ly) < hh;
  }

  #bindEvents() {
    this.canvas.addEventListener("pointerdown", this.#handlePointerDown);
    window.addEventListener("pointermove", this.#handlePointerMove);
    window.addEventListener("pointerup", this.#handlePointerUp);
    window.addEventListener("keydown", this.#handleKeyDown);
  }

  #updateCursor(e) {
    const p = this.#getCanvasPoint(e);
    if (this.#hitCorner(p.x, p.y)) {
      this.canvas.style.cursor = "nwse-resize";
    } else if (this.#hitRotate(p.x, p.y)) {
      this.canvas.style.cursor = "grab";
    } else if (this.#hitImage(p.x, p.y)) {
      this.canvas.style.cursor = "move";
    } else {
      this.canvas.style.cursor = "default";
    }
  }

  #createControls() {
    this.controls = document.createElement("div");
    this.controls.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; z-index: 1001;
      transform: translateX(-50%); display: flex; gap: 10px;
    `;

    const okBtn = document.createElement("button");
    okBtn.textContent = "\u2713 Place";
    okBtn.className = "button";
    okBtn.style.cssText = "font-size: 15px; padding: 8px 18px;";
    okBtn.onclick = () => this.confirm();

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "\u2715 Cancel";
    cancelBtn.className = "button";
    cancelBtn.style.cssText = "font-size: 15px; padding: 8px 18px;";
    cancelBtn.onclick = () => this.cancel();

    this.controls.appendChild(okBtn);
    this.controls.appendChild(cancelBtn);
    document.body.appendChild(this.controls);
  }

  confirm() {
    const layerId = this.rkgk.addLayerFromImageWithTransform(
      this.image,
      this.imgW,
      this.imgH,
      this.pos.x,
      this.pos.y,
      this.scale,
      this.rotation,
    );
    this.#cleanup();
    this.onConfirm?.(layerId);
  }

  cancel() {
    this.#cleanup();
    this.onCancel?.();
  }

  #cleanup() {
    this.running = false;
    this.observer?.disconnect();
    this.mainCanvas.style.pointerEvents = "";
    this.mainCanvas.style.cursor = "";
    this.canvas.removeEventListener("pointerdown", this.#handlePointerDown);
    window.removeEventListener("pointermove", this.#handlePointerMove);
    window.removeEventListener("pointerup", this.#handlePointerUp);
    window.removeEventListener("keydown", this.#handleKeyDown);
    this.canvas.remove();
    this.controls?.remove();
  }
}
