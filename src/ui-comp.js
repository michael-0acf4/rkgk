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

export class LayerMenu extends VerticalMenu {
  constructor(root, { onAddLayer, onRemoveLayer, onSwap, onActiveChange }) {
    super(root);
    this.onAddLayer = onAddLayer;
    this.onRemoveLayer = onRemoveLayer;
    this.onSwap = onSwap;
    this.onActiveChange = onActiveChange;
    this.activeId = null;
  }

  setLayers(layers) {
    this.clear();

    const addBtn = document.createElement("button");
    addBtn.className = "button";
    addBtn.textContent = "+ Layer";
    addBtn.onclick = () => this.onAddLayer();
    this.add(addBtn);

    const list = document.createElement("div");
    list.className = "layer-list";
    this.add(list);

    layers.forEach((layer) => {
      const row = document.createElement("div");
      row.className = "layer-row";
      row.draggable = true;
      row.dataset.id = layer.id;

      const thumb = document.createElement("div");
      thumb.setAttribute("id", "layer_thumb_" + layer.id);
      thumb.className = "thumb";

      const remove = document.createElement("button");
      remove.className = "remove";
      remove.textContent = "x";
      remove.onclick = (e) => {
        e.stopPropagation();
        this.onRemoveLayer(layer.id);
      };

      row.appendChild(thumb);
      row.appendChild(remove);
      list.appendChild(row);

      row.onclick = () => {
        this.activeId = layer.id;
        this.updateActive(list);
        this.onActiveChange?.(layer.id);
      };

      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", layer.id);
      });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromId = e.dataTransfer.getData("text/plain");
        const toId = layer.id;
        if (fromId && fromId !== toId) {
          this.onSwap({ fromId, toId });
        }
      });
    });

    this.updateActive(list);
  }

  updateActive(list) {
    [...list.children].forEach((el) => {
      el.classList.toggle("active", el.dataset.id === this.activeId);
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
      pressure: 1,
    };

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    brushes.forEach((brush) => {
      const el = document.createElement("div");
      el.className = "thumb";
      el.dataset.id = brush.id;
      el.onclick = () => {
        this.state.brushId = brush.id;
        this.updateSelection(list);
        onSelectBrush(brush);
      };
      list.appendChild(el);
    });

    const color = document.createElement("input");
    color.type = "color";

    const size = document.createElement("input");
    size.type = "range";
    size.min = 1;
    size.max = 100;

    const pressure = document.createElement("input");
    pressure.type = "range";
    pressure.min = 0;
    pressure.max = 1;
    pressure.step = 0.01;

    color.oninput = () => {
      this.state.color = color.value;
      onChangeSettings(this.settings());
    };
    size.oninput = () => {
      this.state.size = +size.value;
      onChangeSettings(this.settings());
    };
    pressure.oninput = () => {
      this.state.pressure = +pressure.value;
      onChangeSettings(this.settings());
    };

    this.add(list);
    this.add(color);
    this.add(size);
    this.add(pressure);

    this.updateSelection(list);
  }

  updateSelection(list) {
    [...list.children].forEach((el) => {
      el.classList.toggle("selected", el.dataset.id === this.state.brushId);
    });
  }

  settings() {
    const { color, size, pressure } = this.state;
    return { color, size, pressure };
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
