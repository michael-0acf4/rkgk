import { Layer } from "../rkgk/rkgk.js";
import { createSpacer, helpWindow, projectOptionsWindow } from "./ui-window.js";

export function getLayerContainerId({ id }) {
  return ["layer", "container", id].join("-");
}

export function getBrushContainerId({ id }) {
  return ["brush", "container", id].join("-");
}

export class VerticalMenu {
  constructor(root) {
    this.root = root;
  }

  clear() {
    this.root.innerHTML = "";
  }

  add(el) {
    this.root.appendChild(el);
  }
}

class LayerComponent {
  /**
   * @param {Layer} layer
   */
  constructor(layer, onRemoveLayer) {
    this.layer = layer;
    this.onRemoveLayer = onRemoveLayer;
    this.root = document.createElement("div");
    this.root.className = "layer-row";
    this.root.draggable = true;
    this.root.dataset.id = layer.id;
  }

  create() {
    const thumb = document.createElement("div");
    thumb.setAttribute("id", getLayerContainerId(this.layer));
    thumb.className = "thumb-layer";

    const layerControls = document.createElement("div");
    layerControls.className = "layer-controls";

    const remove = document.createElement("button");
    remove.className = "layer-flag";
    remove.textContent = "x";
    remove.onclick = (e) => {
      e.stopPropagation();
      this.onRemoveLayer?.(this.layer.id);
    };

    const visible = document.createElement("button");
    visible.className = "layer-flag";
    visible.textContent = "👁";
    visible.onclick = (e) => {
      e.stopPropagation();
      this.layer.isVisible = !this.layer.isVisible;
      this.update();
    };
    this.visible = visible;

    layerControls.appendChild(remove);
    layerControls.appendChild(visible);

    this.root.appendChild(thumb);
    this.root.appendChild(layerControls);
    this.update();

    return this.root;
  }

  update() {
    if (!this.layer.isVisible) {
      this.visible.className = "layer-flag layer-flag-disable";
    } else {
      this.visible.className = "layer-flag";
    }
  }
}

export class LayerMenu extends VerticalMenu {
  constructor(root, { rkgk }) {
    super(root);
    this.rkgk = rkgk;
    this.state = {
      layerRows: new Map(), // layerId -> row element
    };

    this.initUI();
    this.update();
  }

  initUI() {
    this.addBtn = document.createElement("button");
    this.addBtn.className = "button";
    this.addBtn.textContent = "+ Layer";
    this.addBtn.onclick = () => {
      const newLayer = this.rkgk.addLayer();
      this.rkgk.currentLayerId = newLayer.id;
      this.update();
      updateLayerThumbnail(newLayer).catch(console.error);
    };

    this.opacityInput = document.createElement("input");
    this.opacityInput.type = "range";
    this.opacityInput.className = "slider";
    this.opacityInput.min = 0;
    this.opacityInput.max = 1;
    this.opacityInput.step = 0.01;
    this.opacityInput.oninput = () => {
      const layer = this.rkgk.getLayer(this.rkgk.currentLayerId);
      if (layer) layer.opacity = +this.opacityInput.value;
    };

    this.layerList = document.createElement("div");
    this.layerList.className = "layer-list";

    this.add(this.addBtn);
    this.add(this.opacityInput);
    this.add(this.layerList);
  }

  update() {
    const layers = this.rkgk.layers;
    const list = this.layerList;

    const alive = new Set(layers.map((l) => l.id));
    for (const [id, row] of this.state.layerRows) {
      if (!alive.has(id)) {
        row.remove();
        this.state.layerRows.delete(id);
      }
    }

    const reversedLayers = [...layers].reverse();
    reversedLayers.forEach((layer, uiIndex) => {
      let row = this.state.layerRows.get(layer.id);
      if (!row) {
        row = this.createRow(layer);
        this.state.layerRows.set(layer.id, row);
      }

      if (list.children[uiIndex] !== row) {
        list.insertBefore(row, list.children[uiIndex] || null);
      }
    });

    const activeLayer = layers.find((l) => l.id === this.rkgk.currentLayerId);
    if (activeLayer) this.opacityInput.value = activeLayer.opacity ?? 1;

    this.updateActive();
  }

  createRow(layer) {
    const row = new LayerComponent(layer, () => {
      this.rkgk.removeLayer(layer.id);
      if (this.rkgk.currentLayerId === layer.id) {
        this.rkgk.currentLayerId =
          this.rkgk.layers[this.rkgk.layers.length - 1]?.id ?? null;
      }
      this.update();
    }).create();

    row.dataset.id = layer.id;
    row.draggable = true;

    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", layer.id);
    });

    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData("text/plain");
      const toId = layer.id;
      if (!fromId || fromId === toId) return;

      const layers = this.rkgk.layers;
      const fromIndex = layers.findIndex((l) => l.id === fromId);
      const toIndex = layers.findIndex((l) => l.id === toId);

      const [movedLayer] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, movedLayer);

      this.update();
    });

    row.onclick = () => {
      this.rkgk.currentLayerId = layer.id;
      this.opacityInput.value = layer.opacity ?? 1;
      this.updateActive();
    };

    return row;
  }

  updateActive() {
    [...this.layerList.children].forEach((el) => {
      el.classList.toggle("active", el.dataset.id === this.rkgk.currentLayerId);
    });
  }
}

export class BrushMenu extends VerticalMenu {
  constructor(
    root,
    {
      brushes,
      activeBrushId,
      onSelectBrush,
      onChangeSettings,
    },
  ) {
    super(root);

    this.onChangeSettings = onChangeSettings;
    this.onSelectBrush = onSelectBrush;

    this.state = {
      activeBrushId,
      brushSettings: new Map(
        brushes.map((b) => [
          b.id,
          {
            color: b.color ?? "#000",
            size: b.size,
            opacity: 1,
            hardness: 1,
          },
        ]),
      ),
    };

    const brushLabel = document.createElement("span");
    const updateActiveBrushLabel = () => {
      const brush = brushes.find((b) => b.id === this.state.activeBrushId);
      brushLabel.textContent = brush?.name ?? "";
    };

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    brushes.forEach((brush) => {
      const el = document.createElement("div");
      el.className = "thumb-brush";
      el.dataset.id = brush.id;
      el.setAttribute("id", getBrushContainerId(brush));

      el.onclick = () => {
        this.state.activeBrushId = brush.id;
        this.syncUI();
        this.updateSelection(list);
        updateActiveBrushLabel();
        this.onSelectBrush?.(brush);
      };

      list.appendChild(el);
    });

    const size = document.createElement("input");
    size.type = "range";
    size.className = "slider";
    size.min = 2;
    size.max = 50;
    size.oninput = () => {
      this.activeSettings.size = +size.value;
      this.emitChange();
    };

    const hardness = document.createElement("input");
    hardness.type = "range";
    hardness.className = "slider";
    hardness.min = 0.2;
    hardness.max = 1;
    hardness.step = 0.1;
    hardness.oninput = () => {
      this.activeSettings.hardness = +hardness.value;
      this.emitChange();
    };

    const color = document.createElement("input");
    color.type = "color";
    color.oninput = () => {
      this.activeSettings.color = color.value;
      this.emitChange();
    };

    this.controls = { size, hardness, color };

    this.add(brushLabel);
    this.add(list);
    this.add(size);
    this.add(hardness);
    this.add(color);

    updateActiveBrushLabel();
    this.updateSelection(list);
    this.syncUI();
  }

  get activeSettings() {
    return this.state.brushSettings.get(this.state.activeBrushId);
  }

  emitChange() {
    this.onChangeSettings?.({
      brushId: this.state.activeBrushId,
      settings: structuredClone(this.activeSettings),
    });
  }

  syncUI() {
    const s = this.activeSettings;
    if (!s) return;

    this.controls.size.value = s.size;
    this.controls.hardness.value = s.hardness;
    this.controls.color.value = s.color;
  }

  updateSelection(list) {
    [...list.children].forEach((el) => {
      el.classList.toggle(
        "active",
        el.dataset.id === this.state.activeBrushId,
      );
    });
  }
}

export class CanvasViewport {
  constructor(rkgk, { onZoom, onPan, onRedo, onRequestUIReload }) {
    this.rkgk = rkgk;
    this.onZoom = onZoom;
    this.onPan = onPan;
    this.onRedo = onRedo;
    this.onRequestUIReload = onRequestUIReload;

    this.state = {
      scale: 1,
      x: 0,
      y: 0,
    };

    this.dragging = false;
    this.last = { x: 0, y: 0 };
    this.activePointerId = null;
    this.canvas = null;

    this.createControls();
    this.update(); // attach initial canvas
  }

  apply() {
    if (!this.canvas) return;

    const { x, y, scale } = this.state;
    this.canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

    if (this.scaleDisplay) {
      this.scaleDisplay.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  clampPan() {
    const MAX = 100_000; // pragmatic safety bound
    this.state.x = Math.max(-MAX, Math.min(MAX, this.state.x));
    this.state.y = Math.max(-MAX, Math.min(MAX, this.state.y));
  }

  zoomAt(factor, screenX, screenY) {
    if (!this.canvas) return;

    const prev = this.state.scale;
    const next = Math.min(4, Math.max(0.1, prev * factor));
    if (prev === next) return;

    const rect = this.canvas.getBoundingClientRect();
    const px = screenX - rect.left;
    const py = screenY - rect.top;

    // keep (px, py) visually fixed
    const k = next / prev;
    this.state.x -= px * (k - 1);
    this.state.y -= py * (k - 1);

    this.state.scale = next;
    this.clampPan();
    this.apply();

    this.onZoom?.({ scale: next });
  }

  pan(dx, dy) {
    this.state.x += dx;
    this.state.y += dy;
    this.clampPan();
    this.apply();

    this.onPan?.({ x: this.state.x, y: this.state.y });
  }

  reset() {
    this.state = { scale: 1, x: 0, y: 0 };
    this.apply();

    this.onPan?.({ x: 0, y: 0 });
    this.onZoom?.({ scale: 1 });
  }

  /* ---------------- lifecycle ---------------- */

  update() {
    const nextCanvas = this.rkgk?.renderer?.canvas ?? null;
    if (nextCanvas === this.canvas) return;

    this.detach();
    if (nextCanvas) this.attach(nextCanvas);
  }

  centerCanvas() {
    if (!this.canvas) return;

    // const viewport = this.canvas.parentElement.getBoundingClientRect();
    // this.state.x = (viewport.width  - this.canvas.width  * this.state.scale) / 2;
    // this.state.y = (viewport.height - this.canvas.height * this.state.scale) / 2;

    this.state.x = (-this.canvas.width * this.state.scale) / 2;
    this.state.y = (-this.canvas.height * this.state.scale) / 2;

    this.apply();
  }

  attach(canvas) {
    // const newRect = canvas.getBoundingClientRect();

    // if (this.lastCanvasRect) {
    //   // preserve center position
    //   const dx = (newRect.width  - this.lastCanvasRect.width)  / 2;
    //   const dy = (newRect.height - this.lastCanvasRect.height) / 2;

    //   this.state.x -= dx * this.state.scale;
    //   this.state.y -= dy * this.state.scale;
    // }

    this.canvas = canvas;
    // this.lastCanvasRect = newRect;

    // canvas.style.transformOrigin = "0 0";

    this.clampPan();
    this.apply();
    this.bind();
    this.centerCanvas();
  }

  detach() {
    if (!this.canvas) return;

    if (this.activePointerId != null) {
      try {
        this.canvas.releasePointerCapture(this.activePointerId);
      } catch {}
    }

    this.unbind();
    this.canvas = null;
    this.dragging = false;
    this.activePointerId = null;
  }

  destroy() {
    this.detach();

    if (this.controls?.parentNode) {
      this.controls.parentNode.removeChild(this.controls);
    }

    this.controls = null;
    this.scaleDisplay = null;
    this.rkgk = null;
  }

  createControls() {
    const btn = (text, title, fn) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.title = title;
      b.onclick = fn;
      return b;
    };

    this.controls = document.createElement("div");
    this.controls.className = "canvas-controls";

    this.scaleDisplay = document.createElement("span");
    this.scaleDisplay.style.cursor = "pointer";
    this.scaleDisplay.title = "Reset zoom & pan";
    this.scaleDisplay.onclick = () => this.reset();

    this.controls.append(
      btn(
        "Project",
        "Project options",
        () => projectOptionsWindow(this.rkgk, this.onRequestUIReload),
      ),
      btn("?", "Help", () => helpWindow()),
      createSpacer(48),
      btn("<", "Undo (Ctrl+Z)", () => this.onRedo?.("backward")),
      btn(
        "-",
        "Zoom out",
        () => this.zoomAt(0.9, window.innerWidth / 2, window.innerHeight / 2),
      ),
      this.scaleDisplay,
      btn(
        "+",
        "Zoom in",
        () => this.zoomAt(1.1, window.innerWidth / 2, window.innerHeight / 2),
      ),
      btn(">", "Redo (Ctrl+Y)", () => this.onRedo?.("forward")),
    );

    const parent = document.body;
    parent.style.position = "relative";
    parent.appendChild(this.controls);
  }

  bind() {
    this.onWheel = (e) => {
      if (!e.altKey) return;
      e.preventDefault();

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomAt(factor, e.clientX, e.clientY);
    };

    this.onPointerDown = (e) => {
      this.dragging = true;
      this.activePointerId = e.pointerId;
      this.last.x = e.clientX;
      this.last.y = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };

    this.onPointerMove = (e) => {
      if (!this.dragging || !e.altKey) return;
      this.pan(e.clientX - this.last.x, e.clientY - this.last.y);
      this.last.x = e.clientX;
      this.last.y = e.clientY;
    };

    this.onPointerUp = (e) => {
      if (this.activePointerId === e.pointerId) {
        this.dragging = false;
        this.activePointerId = null;
        this.canvas.releasePointerCapture(e.pointerId);
      }
    };

    this.onKeyDown = (e) => {
      if (e.target.tagName === "INPUT") return;

      const panStep = e.shiftKey ? 50 : 10;
      const k = e.key.toLowerCase();

      if (e.ctrlKey && !e.shiftKey && k === "z") {
        e.preventDefault();
        this.onRedo?.("backward");
      } else if (
        (e.ctrlKey && !e.shiftKey && k === "y") ||
        (e.ctrlKey && e.shiftKey && k === "z")
      ) {
        e.preventDefault();
        this.onRedo?.("forward");
      } else if (k === "r") {
        e.preventDefault();
        this.reset();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.pan(0, -panStep);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.pan(0, panStep);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.pan(-panStep, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.pan(panStep, 0);
      }
    };

    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
  }

  unbind() {
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);

    if (!this.canvas) return;

    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
  }
}

async function replaceThumbSrc(div, thumb) {
  if (!div) return;

  let imgEl = div.querySelector("img");
  if (!imgEl) {
    imgEl = document.createElement("img");
    imgEl.draggable = false;
    div.appendChild(imgEl);
  }

  // TODO:
  // Is it really GC'd?
  imgEl.src = thumb.drawable.src;
  thumb.drawable = null;
}

export async function updateLayerThumbnail(layer) {
  const elId = getLayerContainerId(layer);
  const div = document.getElementById(elId);

  await replaceThumbSrc(div, await layer.getThumbnail(64, 86));
}

export async function updateBrushThumbnail(brush) {
  const elId = getBrushContainerId(brush);
  const div = document.getElementById(elId);

  await replaceThumbSrc(div, await brush.getThumbnail(100, 40));
}
