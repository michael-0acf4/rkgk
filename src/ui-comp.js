import { Layer, RkgkEngine } from "./rkgk.js";

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
  constructor(
    root,
    activeId,
    { onAddLayer, onRemoveLayer, onInsert, onActiveChange },
  ) {
    super(root);
    this.onAddLayer = onAddLayer;
    this.onRemoveLayer = onRemoveLayer;
    this.onInsert = onInsert;
    this.onActiveChange = onActiveChange;

    this.state = {
      activeId,
      layerRows: new Map(), // map layerId -> row element
    };
  }

  setLayers(layers) {
    const list = this.layerList || document.createElement("div");
    list.className = "layer-list";
    this.layerList = list;
    this.layers = layers;

    if (!this.addBtn) {
      const addBtn = document.createElement("button");
      addBtn.className = "button";
      addBtn.textContent = "+ Layer";
      addBtn.onclick = () => this.onAddLayer();
      this.addBtn = addBtn;
      this.add(addBtn);
    }

    if (!this.opacityInput) {
      const opacity = document.createElement("input");
      opacity.type = "range";
      opacity.className = "slider";
      opacity.min = 0;
      opacity.max = 1;
      opacity.step = 0.01;
      this.opacityInput = opacity;
      this.add(opacity);

      opacity.oninput = () => {
        const layer = this.layers.find((l) => l.id === this.state.activeId);
        if (layer) layer.opacity = +opacity.value;
      };
    }

    const activeLayer = layers.find((l) => l.id === this.state.activeId);
    if (activeLayer) {
      this.opacityInput.value = activeLayer.opacity ?? 1;
    }

    if (!list.parentNode) this.add(list);

    layers.forEach((layer) => {
      let row = this.state.layerRows.get(layer.id);
      if (!row) {
        row = new LayerComponent(layer, this.onRemoveLayer).create();
        row.dataset.id = layer.id;
        list.appendChild(row);
        this.state.layerRows.set(layer.id, row);

        row.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", layer.id);
        });
        row.addEventListener("dragover", (e) => e.preventDefault());
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          const fromId = e.dataTransfer.getData("text/plain");
          const toId = layer.id;
          if (fromId && fromId !== toId) {
            const fromRow = this.state.layerRows.get(fromId);
            const toRow = this.state.layerRows.get(toId);
            if (!fromRow || !toRow) return;

            const list = toRow.parentNode;

            //! swap nodes: visually
            const children = [...list.children];
            const fromIndex = children.indexOf(fromRow);
            const toIndex = children.indexOf(toRow);
            list.removeChild(fromRow);

            if (fromIndex < toIndex) {
              list.insertBefore(fromRow, toRow.nextSibling);
            } else {
              list.insertBefore(fromRow, toRow);
            }

            this.onInsert({ fromId, toId });
          }
        });

        row.onclick = () => {
          this.state.activeId = layer.id;
          this.opacityInput.value = layer.opacity ?? 1;
          this.updateActive(list);
          this.onActiveChange?.(layer.id);
        };
      } else {
        // row already exists
      }
    });

    const alive = new Set(layers.map((l) => l.id));
    for (const [id, row] of this.state.layerRows) {
      if (!alive.has(id)) {
        row.remove();
        this.state.layerRows.delete(id);
      }
    }
    this.updateActive(list);
  }

  updateActive(list) {
    [...list.children].forEach((el) => {
      el.classList.toggle("active", el.dataset.id === this.state.activeId);
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
  constructor(canvas, { onZoom, onPan, onRedo }) {
    this.canvas = canvas;
    this.onZoom = onZoom;
    this.onPan = onPan;
    this.onRedo = onRedo;

    this.state = { scale: 1, x: 0, y: 0 };
    this.dragging = false;
    this.last = { x: 0, y: 0 };

    this.apply();
    this.createControls();
    this.bind();
  }

  apply() {
    const { scale, x, y } = this.state;
    this.canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    if (this.scaleDisplay) {
      this.scaleDisplay.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  zoom(factor) {
    this.state.scale = Math.min(4, Math.max(0.1, this.state.scale * factor));
    this.apply();
    this.onZoom?.({ scale: this.state.scale });
  }

  pan(dx, dy) {
    this.state.x += dx;
    this.state.y += dy;
    this.apply();
    this.onPan?.({ x: this.state.x, y: this.state.y });
  }

  reset() {
    this.state = { scale: 1, x: 0, y: 0 };
    this.onPan?.({ x: this.state.x, y: this.state.y });
    this.onZoom?.({ scale: this.state.scale });
    this.apply();
  }

  createControls() {
    this.controls = document.createElement("div");
    this.controls.className = "canvas-controls";

    const backBtn = document.createElement("button");
    backBtn.textContent = "<";
    backBtn.title = "Undo (Ctrl+Z)";
    backBtn.onclick = () => this.onRedo?.("backward");

    const forwardBtn = document.createElement("button");
    forwardBtn.textContent = ">";
    forwardBtn.title = "Redo (Ctrl+Y)";
    forwardBtn.onclick = () => this.onRedo?.("forward");

    const minus = document.createElement("button");
    minus.textContent = "-";
    minus.title = "Zoom Out";
    minus.onclick = () => this.zoom(0.9);

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.title = "Zoom In";
    plus.onclick = () => this.zoom(1.1);

    this.scaleDisplay = document.createElement("span");
    this.scaleDisplay.textContent = `${Math.round(this.state.scale * 100)}%`;
    this.scaleDisplay.title = "Click to reset zoom/pan";
    this.scaleDisplay.style.cursor = "pointer";
    this.scaleDisplay.onclick = () => this.reset();

    this.controls.append(backBtn, minus, this.scaleDisplay, plus, forwardBtn);

    const parent = this.canvas.parentElement;
    parent.style.position = "relative";
    parent.appendChild(this.controls);
  }

  bind() {
    window.addEventListener(
      "wheel",
      (e) => {
        if (!e.altKey) return;
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? 1.1 : 0.9);
      },
      { passive: false },
    );

    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.last.x = e.clientX;
      this.last.y = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging || !e.altKey) return;
      this.pan(e.clientX - this.last.x, e.clientY - this.last.y);
      this.last.x = e.clientX;
      this.last.y = e.clientY;
    });

    this.canvas.addEventListener("pointerup", (e) => {
      this.dragging = false;
      this.canvas.releasePointerCapture(e.pointerId);
    });

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;

      const panStep = e.shiftKey ? 50 : 10;
      switch (true) {
        case e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z": {
          e.preventDefault();
          this.onRedo?.("backward");
          break;
        }
        case (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "y") ||
          (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z"): {
          e.preventDefault();
          this.onRedo?.("forward");
          break;
        }
        case e.key.toLowerCase() === "r": {
          e.preventDefault();
          this.reset();
          break;
        }
        case e.key === "ArrowUp": {
          e.preventDefault();
          this.pan(0, -panStep);
          break;
        }
        case e.key === "ArrowDown": {
          e.preventDefault();
          this.pan(0, panStep);
          break;
        }
        case e.key === "ArrowLeft": {
          e.preventDefault();
          this.pan(-panStep, 0);
          break;
        }
        case e.key === "ArrowRight": {
          e.preventDefault();
          this.pan(panStep, 0);
          break;
        }
      }
    });
  }
}

export async function updateLayerThumbnail(layer) {
  const elId = getLayerContainerId(layer);
  const div = document.getElementById(elId);
  if (!div) {
    return;
  }

  const img = await layer.getThumbnail(64, 86);
  div.innerHTML = "";
  div.appendChild(img.drawable);
}

export async function updateBrushThumbnail(brush) {
  const elId = getBrushContainerId(brush);

  const div = document.getElementById(elId);
  if (!div) {
    return;
  }

  const img = await brush.getThumbnail(100, 40);
  div.innerHTML = "";
  div.appendChild(img.drawable);
}
