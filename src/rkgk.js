/** @typedef {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}} Renderer */
/** @typedef {"down" | "up" | "move" | "release" } EventKind */
/** @typedef {{ x: number, y: number, pressure: number }} PointerData */
/** @typedef {{ kind: EventKind, pointer: PointerData, pointerId: number | null }} RkgkEvent */
/** @typedef {{ lastPos: PointerData, drawing: boolean, activePointerId: number | null }} EventState */

let GLOBAL_ID = 0;
const MAX_LAYER_HISTORY = 20;

export class BrushTexture {
  /**
   * @param {number} size 
   */
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

  /**
   * @param {string} url 
   */
  static async fromImage(url) {
    const img = new Image();
    img.src = url;
    return new Promise((resolve, reject) => {
      img.onload = () => {
        console.warn("Loaded texture", url);
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

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {PointerData} from
   * @param {PointerData} to
   */
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

      this.dab(ctx, {
        x,
        y,
        pressure: to.pressure,
      });

      traveled += step;
    }

    this._carry = traveled - dist;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {PointerData} pointer
   */
  dab(ctx, pointer) {
    const p = this.pressureCurve(pointer.pressure);
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
      pointer.x - size / 2,
      pointer.y - size / 2,
      size * ar,
      size,
    );
  }
}

export class Layer {
  /**
   * @param {number} width 
   * @param {number} height 
   */
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

class RkgkEventBUS {
  constructor() {
    /** @type RkgkEvent[] */
    this.eventQueue = [];
    /** @type {EventState} */
    this.state = {
      drawing: false,
      lastPos: null,
      activePointerId: null      
    };
  }

  /** @param {RkgkEvent} event */
  dispatch(event) {
    this.eventQueue.push(event);
  }

  poll() {
    return this.eventQueue.shift();
  }
}

export class RkgkEngine {
  /** @param canvas {HTMLCanvasElement} */
  constructor(canvas) {
    this.eventBUS = new RkgkEventBUS();
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

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure ?? 0.5,
      };
    };

    const toBind = {
      down: ["pointerdown"],
      up: ["pointerup"],
      move: ["pointermove"],
      release: ["pointercancel"],
    };
    const requireCapture = ["pointerdown"];
    const requireUncapture = ["pointerup"];

    for (const [rkgkEventName, html5EventNames] of Object.entries(toBind)) {
      for (const eventName of html5EventNames) {
        canvas.addEventListener(eventName, (e) => {
          e.preventDefault();
          if (requireCapture.includes(eventName)) {
            e.target.setPointerCapture(e.pointerId);
          } else if (requireUncapture.includes(eventName)) {
            e.target.releasePointerCapture(e.pointerId);
          }

          const coalesced = e.getCoalescedEvents?.();
          const events = (coalesced && coalesced.length > 0) ? coalesced : [e];
          for (const event of events) {
            const pos = getPos(event);
            this.eventBUS.dispatch({
              kind: rkgkEventName,
              pointer: pos,
              pointerId: e.pointerId ?? null,
            });
          }
        });
      }
    }

    // Disables right click
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /**
   * @param {RkgkEvent} event
   */
  #handleEvent(event) {
    const { state } = this.eventBUS;
    switch (event.kind) {
      case "down": {
        state.drawing = true;
        state.lastPos = event.pointer;
        state.activePointerId = event.pointerId;
        break;
      }
      case "release":
      case "up": {
        if (event.pointerId == state.activePointerId) {
          this.getLayer(this.currentLayerId)?.snapshot();
          state.drawing = false;
          state.lastPos = null;
          state.activePointerId = null;
        }
        break;
      }
      case "move": {
        const layer = this.getLayer(this.currentLayerId);
        if (
          event.pointerId == state.activePointerId && state.drawing && layer &&
          state.lastPos
        ) {
          this.brush.stroke(
            layer.renderer.context,
            state.lastPos,
            event.pointer,
          );
          state.lastPos = event.pointer;
        }
      }
    }
  }

  /**
   * @param {EventState} state
   */
  pollState() {
    let event;
    while ((event = this.eventBUS.poll())) {
      this.#handleEvent(event);
    }
  }
}
