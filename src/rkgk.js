/** @typedef {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}} Renderer */
let GLOBAL_ID = 0;
const MAX_LAYER_HISTORY = 20;

export class BrushTexture {
  static async proceduralSoft(size) {
    this.canvas = new OffscreenCanvas(size, size);
    const ctx = this.canvas.getContext("2d");

    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    return {
      drawable: this.canvas,
      width: size,
      height: size,
    };
  }

  static async fromImage(url) {
    const img = new Image();
    img.src = url;
    return new Promise((resolve, reject) => {
      img.onload = () => {
        console.log("Loaded texture", url);
        resolve({
          drawable: img,
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = reject;
    });
  }
}

export class Brush {
  constructor({
    texture,
    spacing,
    size,
    pressureCurve = (p) => p,
  }) {
    this.texture = texture;
    this.spacing = spacing;
    this.size = size;
    this.pressureCurve = pressureCurve;

    this._carry = 0;
  }

  stroke(ctx, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.001) return;

    const step = this.size * this.spacing;
    let traveled = this._carry;

    while (traveled < dist) {
      const t = traveled / dist;
      const x = from.x + dx * t;
      const y = from.y + dy * t;

      this.dab(ctx, x, y, to.pressure);

      traveled += step;
    }

    this._carry = traveled - dist;
  }

  dab(ctx, x, y, pressure) {
    const p = this.pressureCurve(pressure);
    if (p <= 0) return;

    const size = this.size * p;

    ctx.globalAlpha = p;
    const ar = this.texture.width / Math.max(0.0001, this.texture.height);
    ctx.drawImage(
      this.texture.drawable,
      0,
      0,
      this.texture.width,
      this.texture.height,
      x - size / 2,
      y - size / 2,
      size,
      size * ar,
    );
  }
}

export class Layer {
  constructor(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    this.id = ++GLOBAL_ID;
    /** @type {Renderer} */
    this.renderer = {
      canvas,
      context: canvas.getContext("2d", {
        willReadFrequently: true,
      }),
    };
    this.isVisible = true;
    this.opacity = 1.0;
    /** @type ImageData[] */
    this.history = [];
  }

  snapshot() {
    this.history.push(this.getImageDataBuffer());
    if (this.history.length > MAX_LAYER_HISTORY) {
      this.history.shift();
    }
  }

  getImageDataBuffer() {
    const { context, canvas } = this.renderer;
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }
}

export class RkgkEngine {
  /** @param canvas {HTMLCanvasElement} */
  constructor(canvas) {
    /** @type {Renderer} */
    this.renderer = {
      canvas,
      context: canvas.getContext("2d", {
        willReadFrequently: true,
      }),
    };
    this.currentLayerId = null;
    /** @type {Layer[]} */
    this.layers = [];
    /** @type {Brush} */
    this.brush = null;
  }

  render() {
    const { context: mainContext, canvas: mainCanvas } = this.renderer;
    mainContext.clearRect(
      0,
      0,
      mainCanvas.width,
      mainCanvas.height,
    );

    for (const layer of this.layers) {
      if (!layer.isVisible) continue;

      mainContext.drawImage(layer.renderer.canvas, 0, 0);
      // SLOW! reserve this for snapshots
      // const buffer = layer.getImageDataBuffer();
      // if (buffer) {
      //   mainContext.putImageData(buffer, 0, 0);
      // }
    }
  }

  addLayer() {
    const { canvas } = this.renderer;
    const layer = new Layer(canvas.width, canvas.height);
    this.layers.push(layer);
    return layer.id;
  }

  removeLayer(id) {
    this.layers = this.layers.filter((l) => l.id != id);
  }

  getLayer(id) {
    return this.layers.find((l) => l.id == id);
  }

  setupDOMEvents() {
    const { canvas } = this.renderer;
    let drawing = false;
    let lastPos = null;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure,
      };
    };

    canvas.addEventListener("pointercancel", (e) => {
      console.log("cancel");
      drawing = false;
    });

    canvas.addEventListener("pointerout", (e) => {
      console.log("out");
      drawing = false;
    });

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      lastPos = getPos(e);
      console.log("down", lastPos);
    });

    canvas.addEventListener("pointerup", (e) => {
      canvas.releasePointerCapture(e.pointerId);
      drawing = false;
      console.log("up", getPos(e));
      if (this.currentLayerId) this.getLayer(this.currentLayerId)?.snapshot();
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!drawing || !this.currentLayerId) return;
      const layer = this.getLayer(this.currentLayerId);
      if (!layer || !layer.isVisible) return;

      const events = e.getCoalescedEvents?.() ?? [e];
      for (const event of events) {
        const pos = getPos(event);
        this.brush.stroke(layer.renderer.context, lastPos, pos);
        lastPos = pos;
      }
    });
  }
}
