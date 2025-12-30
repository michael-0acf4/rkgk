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
    { onAddLayer, onRemoveLayer, onSwap, onActiveChange },
  ) {
    super(root);
    this.onAddLayer = onAddLayer;
    this.onRemoveLayer = onRemoveLayer;
    this.onSwap = onSwap;
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
        const layer = layers.find((l) => l.id === this.state.activeId);
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
            const fromNext = fromRow.nextSibling;
            const toNext = toRow.nextSibling;

            if (fromNext === toRow) {
              //! adjacent nodes: from above toRow
              list.insertBefore(toRow, fromRow);
            } else if (toNext === fromRow) {
              //! adjacent nodes: to above fromRow
              list.insertBefore(fromRow, toRow);
            } else {
              //! non-adjacent: swap by inserting
              list.insertBefore(fromRow, toNext);
              list.insertBefore(toRow, fromNext);
            }

            this.onSwap({ fromId, toId });
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

    this.updateActive(list);
  }

  updateActive(list) {
    [...list.children].forEach((el) => {
      el.classList.toggle("active", el.dataset.id === this.state.activeId);
    });
  }
}

export class BrushMenu extends VerticalMenu {
  constructor(root, {
    brushes,
    activeBrushId,
    onSelectBrush,
    onChangeSettings,
  }) {
    super(root);

    this.state = {
      brushId: activeBrushId,
      color: "#000000",
      size: 10,
      opacity: 1,
    };

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    const brushLabel = document.createElement("span");
    const updateActiveBrushLabel = (activeId) => {
      brushLabel.textContent = brushes.find((b) => b.id === activeId).name;
    };
    updateActiveBrushLabel(activeBrushId);

    brushes.forEach((brush) => {
      const el = document.createElement("div");
      el.className = "thumb-brush";
      el.setAttribute("id", getBrushContainerId(brush));
      el.dataset.id = brush.id;
      el.onclick = () => {
        this.state.brushId = brush.id;
        updateActiveBrushLabel(brush.id);
        this.updateSelection(list);
        onSelectBrush(brush);
      };
      list.appendChild(el);
    });

    const color = document.createElement("input");
    color.type = "color";

    const size = document.createElement("input");
    size.type = "range";
    size.className = "slider";
    size.min = 2;
    size.max = 50;
    size.value = 10;

    color.oninput = () => {
      this.state.color = color.value;
      onChangeSettings(this.settings());
    };
    size.oninput = () => {
      this.state.size = +size.value;
      onChangeSettings(this.settings());
    };

    this.add(brushLabel);
    this.add(list);
    this.add(size);
    this.add(color);

    this.updateSelection(list);
  }

  updateSelection(list) {
    [...list.children].forEach((el) => {
      el.classList.toggle("active", el.dataset.id === this.state.brushId);
    });
  }

  settings() {
    const { color, size, opacity } = this.state;
    return { color, size, opacity };
  }
}

export class CanvasViewport {
  constructor(canvas, { onZoom, onPan }) {
    this.canvas = canvas;
    this.onZoom = onZoom;
    this.onPan = onPan;
    this.state = { scale: 1, x: 0, y: 0 };
    this.dragging = false;
    this.last = { x: 0, y: 0 };
    this.apply();
    this.bind();
  }

  apply() {
    const { scale, x, y } = this.state;
    this.canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
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

  bind() {
    window.addEventListener("wheel", (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });

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
