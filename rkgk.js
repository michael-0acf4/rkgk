/** @typedef {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}} Renderer */
let GLOBAL_ID = 0;
const MAX_LAYER_HISTORY = 20;

class Brush {
  constructor({
    size = 5,
    color = "#000",
    opacity = 1.0,
    pressureCurve = (p) => p,
  } = {}) {
    this.size = size;
    this.color = color;
    this.opacity = opacity;
    this.pressureCurve = pressureCurve;
  }

  draw(ctx, from, to, pressure = 1) {
    const p = this.pressureCurve(pressure);

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = this.opacity * p;
    ctx.lineWidth = this.size * p;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }
}

class Layer {
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

class RkgkEngine {
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

      const buffer = layer.getImageDataBuffer();
      if (buffer) {
        mainContext.putImageData(buffer, 0, 0);
      }
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
    const canvas = this.renderer.canvas;
    let drawing = false;
    let lastPos = null;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    canvas.addEventListener("mousedown", (e) => {
      drawing = true;
      lastPos = getPos(e);
      console.log("mousedown", lastPos);
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!drawing || !this.currentLayerId) return;
      const layer = this.getLayer(this.currentLayerId);
      if (!layer || !layer.isVisible) return;
      const pos = getPos(e);
      this.brush.draw(
        layer.renderer.context,
        lastPos,
        pos,
      );
      lastPos = pos;
    });

    canvas.addEventListener("mouseup", (e) => {
      console.log("mouseup", lastPos);
      drawing = false;
      if (this.currentLayerId) this.getLayer(this.currentLayerId)?.snapshot();
    });
  }
}

//////
const canvas = document.getElementById("canvas");
const rkgk = new RkgkEngine(canvas);
rkgk.brush = new Brush({
  size: 2,
  color: "#000",
  opacity: 1.0,
  pressureCurve: (x) => Math.pow(x, 2),
});
rkgk.currentLayerId = rkgk.addLayer();
rkgk.setupDOMEvents();

function draw() {
  rkgk.render();
  requestAnimationFrame(draw);
}

draw();
