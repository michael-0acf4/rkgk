/** @typedef {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}} Renderer */
/** @typedef {"down" | "up" | "move" | "release" } EventKind */
/** @typedef {{ x: number, y: number, pressure: number, tilt: number, orientation: number }} PointerData */
/** @typedef {{ kind: EventKind, pointer: PointerData, pointerId: number | null }} RkgkEvent */
/** @typedef {{ lastPos: PointerData, drawing: boolean, activePointerId: number | null }} EventState */
/** @typedef {{ drawable: HTMLImageElement, width: number, height: number }} BrushTexture */
/** @typedef {{ offsetX: number, offsetY: number, scale: number }} ViewTransformation */

const MAX_LAYER_HISTORY = 20;

/**
 * @param {string} prefix
 */
function randomId(prefix) {
  let id = prefix ?? "", count = 64;
  while (count--) {
    id += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }

  return id;
}

/**
 * @param {RkgkEngine} rkgk
 * @param {PointerEvent | MouseEvent} e
 * @returns
 */
function getPointerData(rkgk, e) {
  const rect = rkgk.renderer.canvas.getBoundingClientRect();
  const offsetX = rect.left;
  const offsetY = rect.top;
  const scale = rkgk.scale ?? 1.0;

  let tilt = 0, orientation = 0;
  if (e.altitudeAngle != null && e.azimuthAngle != null) {
    tilt = Math.max(0, Math.min(1, 1 - e.altitudeAngle / (Math.PI / 2)));
    orientation = e.azimuthAngle;
  } else if (e.tiltX != null && e.tiltY != null) {
    const tx = e.tiltX * Math.PI / 180;
    const ty = e.tiltY * Math.PI / 180;
    tilt = Math.min(1, Math.hypot(tx, ty) / (Math.PI / 2));
    orientation = Math.atan2(tx, ty);
  }

  return {
    x: (e.clientX - offsetX) / scale,
    y: (e.clientY - offsetY) / scale,
    pressure: e.pressure ?? 0.5,
    tilt,
    orientation,
  };
}

/**
 * @param {OffscreenCanvas | HTMLCanvasElement} canvas
 * @param {boolean?} transparent
 */
export async function canvasToImage(canvas, transparent = true) {
  const type = transparent ? "image/png" : "image/jpeg";

  let url;
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type });
    url = URL.createObjectURL(blob);
  } else {
    url = canvas.toDataURL(type);
  }

  const img = new Image();
  img.src = url;
  await img.decode();
  return { drawable: img, width: img.width, height: img.height };
}

// IDEA: speed curve: slower strokes => denser

export class Brush {
  constructor({
    name,
    spacing,
    size,
    textureLoader,
    angleTransform,
    squashTransform,
    pressureCurve = (p) => p,
  }) {
    this.id = randomId("brush.");
    this.name = name;
    this.texture = null;
    this.spacing = spacing;
    this.size = size;
    this.textureLoader = textureLoader;
    this.angleTransform = angleTransform;
    this.squashTransform = squashTransform;
    this.pressureCurve = pressureCurve;

    this._carry = 0;
  }

  /**
   * Recompiles original texture with a color filter
   * @param {string} color
   * @param {number} hardness
   */
  async setFilter(color = "#000000", hardness = 1.0) {
    this.color = color;
    this.hardness = hardness;
    /** @type {BrushTexture} */
    this.texture = await this.textureLoader(this.color, this.hardness);
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
        tilt: to.tilt,
        orientation: to.orientation,
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
    const ar = this.texture.width / Math.max(0.0001, this.texture.height);
    const angle = this.angleTransform?.(pointer.orientation) ??
      Math.random() * Math.PI * 2;
    const squishedAr = this.squashTransform?.(ar, pointer.tilt) ??
      (1 + 2 * pointer.tilt) * ar;

    ctx.save();

    ctx.globalAlpha = p;

    ctx.translate(pointer.x, pointer.y);
    ctx.rotate(angle);
    ctx.drawImage(
      this.texture.drawable,
      0,
      0,
      this.texture.width,
      this.texture.height,
      -(size * squishedAr) / 2,
      -size / 2,
      size * squishedAr,
      size,
    );

    ctx.restore();
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  async getThumbnail(width, height) {
    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext("2d");

    const steps = 30;
    const startX = width * 0.1;
    const endX = width * 1.0;
    const midY = height * 0.5;

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);

      const pressure = Math.sin(t * Math.PI);
      const dy = 4 * Math.sin(t * Math.PI * 2) * height * 0.08;

      // size/thickness should be encoded implicitly
      this.dab(ctx, {
        x: startX + t * (endX - startX),
        y: midY + dy,
        pressure,
        tilt: 0,
        orientation: 0,
      });
    }

    return await canvasToImage(off);
  }
}

export class Layer {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    this.id = randomId("layer.");
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
    /** @type ImageData[] */
    this.redoHistory = [];
  }

  snapshot() {
    this.history.push(this.getImageDataBuffer());
    if (this.history.length > MAX_LAYER_HISTORY) {
      this.history.shift();
    }

    this.redoHistory = []; // !
  }

  /**
   * @param {"backward" | "forward"} direction
   */
  historyTravel(direction) {
    const { context } = this.renderer;

    if (direction === "backward") {
      if (this.history.length > 1) {
        const last = this.history.pop();
        this.redoHistory.push(last);
        const previous = this.history[this.history.length - 1];
        context.putImageData(previous, 0, 0);
      }
    } else if (direction == "forward") {
      if (this.redoHistory.length > 0) {
        const next = this.redoHistory.pop();
        context.putImageData(next, 0, 0);
        this.history.push(next);
      }
    }
  }

  getImageDataBuffer() {
    const { context, canvas } = this.renderer;
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  async getThumbnail(width, height) {
    const { canvas } = this.renderer;

    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext("2d");

    // HQ downscale
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const arSrc = canvas.width / canvas.height;
    const arDst = width / height;

    let dw, dh, dx, dy;
    if (arSrc > arDst) {
      dw = width;
      dh = width / arSrc;
      dx = 0;
      dy = (height - dh) / 2;
    } else {
      dh = height;
      dw = height * arSrc;
      dx = (width - dw) / 2;
      dy = 0;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(canvas, dx, dy, dw, dh);

    return await canvasToImage(off);
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
      activePointerId: null,
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
    /** @type {number} */
    this.scale = null;
    /** @type {string | null} */
    this.title = null;
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

      const oldAlpha = mainContext.globalAlpha;
      mainContext.globalAlpha = layer.opacity;
      mainContext.drawImage(layer.renderer.canvas, 0, 0);
      mainContext.globalAlpha = oldAlpha;
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
    layer.snapshot();
    this.layers.push(layer);
    return layer.id;
  }

  /**
   * @param {string} id
   */
  removeLayer(id) {
    this.layers = this.layers.filter((l) => l.id != id);
  }

  /**
   * @param {string} id
   */
  getLayer(id) {
    return this.layers.find((l) => l.id == id);
  }

  getDim() {
    return {
      width: this.renderer.canvas.width,
      height: this.renderer.canvas.height,
    };
  }

  /**
   * @param {"backward" | "forward"} direction
   */
  historyTravel(direction) {
    const layer = this.getLayer(this.currentLayerId);
    if (layer) {
      layer.historyTravel(direction);
    }
  }

  /**
   * @param {number?} newWidth
   * @param {number?} newHeight
   */
  resize(newWidth, newHeight) {
    const mainCanvas = this.renderer.canvas;
    const mainCtx = this.renderer.context;

    const oldMain = mainCtx.getImageData(
      0,
      0,
      mainCanvas.width,
      mainCanvas.height,
    );
    if (newWidth) mainCanvas.width = newWidth;
    if (newHeight) mainCanvas.height = newHeight;

    mainCtx.putImageData(oldMain, 0, 0);

    for (const layer of this.layers) {
      const oldLayerCtx = layer.renderer.context;
      const oldLayer = oldLayerCtx.getImageData(
        0,
        0,
        layer.renderer.canvas.width,
        layer.renderer.canvas.height,
      );

      if (newWidth) layer.renderer.canvas.width = newWidth;
      if (newHeight) layer.renderer.canvas.height = newHeight;

      layer.renderer.context.putImageData(oldLayer, 0, 0);
    }
  }

  /**
   * @param {boolean} transparent
   */
  async getComposedImage(transparent) {
    return await canvasToImage(this.renderer.canvas, transparent);
  }

  drawDebugNumber() {
    const c = () => Math.floor(Math.random() * 1000) % 255;
    this.layers.forEach((layer, i) => {
      const { renderer } = layer;
      const px = Math.round(renderer.canvas.height / 2);
      renderer.context.font = px + "px serif";
      renderer.context.fillStyle = `rgb(${[c(), c(), c()].join(", ")})`;
      renderer.context.fillText("" + i, 0, px);
      layer.snapshot();
    });
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
          state.lastPos &&
          layer.isVisible
        ) {
          this.brush.stroke(
            layer.renderer.context,
            state.lastPos,
            event.pointer,
            // TODO: speed for speed curve
          );
          state.lastPos = event.pointer;
        }
      }
    }
  }

  pollState() {
    let event;
    while ((event = this.eventBUS.poll())) {
      this.#handleEvent(event);
    }
  }

  setupDOMEvents({
    ignoreUponOneOfModifierKeys = ["alt"],
  }) {
    const { canvas } = this.renderer;
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
          const pressed = [
            e.altKey ? "alt" : null,
            e.shiftKey ? "shift" : null,
            e.ctrlKey ? "ctrl" : null,
          ].filter((k) => !!k);

          for (const key of pressed) {
            if (ignoreUponOneOfModifierKeys.includes(key)) {
              // console.log("skip");
              return;
            }
          }

          if (requireCapture.includes(eventName)) {
            e.target.setPointerCapture(e.pointerId);
          } else if (requireUncapture.includes(eventName)) {
            e.target.releasePointerCapture(e.pointerId);
          }

          const coalesced = e.getCoalescedEvents?.();
          const events = (coalesced && coalesced.length > 0) ? coalesced : [e];
          for (const event of events) {
            this.eventBUS.dispatch({
              kind: rkgkEventName,
              pointer: getPointerData(this, event),
              pointerId: e.pointerId ?? null,
            });
          }
        });
      }
    }

    // No default zoom
    window.addEventListener("wheel", (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "="].includes(e.key)) {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
      }
    });

    // Chrome issues!
    // This prevents pinch-to-zoom on touch devices
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), {
      passive: false,
    });
    canvas.addEventListener("touchmove", (e) => e.preventDefault(), {
      passive: false,
    });
    canvas.addEventListener("touchend", (e) => e.preventDefault(), {
      passive: false,
    });

    // No right click
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}
