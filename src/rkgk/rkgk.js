/** @typedef {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}} Renderer */
/** @typedef {"down" | "up" | "move" | "release" } EventKind */
/** @typedef {{ x: number, y: number, pressure: number, tilt: number, orientation: number }} PointerData */
/** @typedef {{ kind: EventKind, pointer: PointerData, pointerId: number | null }} RkgkEvent */
/** @typedef {{ lastPos: PointerData, drawing: boolean, activePointerId: number | null }} EventState */
/** @typedef {{ drawable: HTMLImageElement, width: number, height: number }} ImageTexture */

/**
 * WARNING!
 * APP_SIGNATURE does not protecc, this script is PUBLIC, so it is merly just a provenance stamp for hints.
 */
const APP_SIGNATURE = "rkgk-v1";
const MAX_LAYER_HISTORY = 50;

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
  if (!transparent) {
    const off = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = off.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(canvas, 0, 0);
    canvas = off;
  }

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

export class Paper {
  constructor({
    staticId,
    name,
    textureLoader = null,
  }) {
    this.id = staticId;
    this.name = name;
    this.textureLoader = textureLoader;
    this.strength = 1.0;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {number?} strength
   */
  async setParameters(width, height, strength) {
    if (strength) {
      this.strength = Math.min(1.0, Math.max(0.0, strength));
    }

    /**
     * @type {ImageTexture}
     */
    this.texture = await this.textureLoader?.(width, height, strength);

    const canvas = new OffscreenCanvas(width, height);
    /**
     * @type {Renderer}
     */
    this.renderer = {
      canvas,
      context: canvas.getContext("2d"),
    };
  }

  /**
   * @param {HTMLCanvasElement | OffscreenCanvas} ogCanvas
   */
  absorbInk(ogCanvas) {
    if (!this.texture || !this.renderer) return ogCanvas;

    const { context: ctx, canvas } = this.renderer;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(ogCanvas, 0, 0);

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(this.texture.drawable, 0, 0); // !mask

    ctx.globalCompositeOperation = "source-over";

    return canvas;
  }
}

/**
 * @param {"horizontal" | "vertical"} direction
 * @returns
 */
export function texPaperLinesInclined(direction) {
  /**
   * @param {number} width
   * @param {number} height
   * @param {number} strength
   */
  return async (width, height, strength = 1.0) => {
    const maskCanvas = new OffscreenCanvas(width, height);
    const ctx = maskCanvas.getContext("2d");

    strength = Math.max(0, Math.min(1, strength));

    const minSpacing = 2;
    const maxSpacing = 5;
    const spacing = Math.round(
      minSpacing + strength * (maxSpacing - minSpacing),
    );

    const minWidth = 1;
    const maxWidth = 4;
    const lineWidth = Math.round(
      minWidth + strength * (maxWidth - minWidth),
    );

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    if (direction == "horizontal") {
      for (let y = 0; y < height; y += spacing) {
        ctx.fillRect(0, y, width, lineWidth);
      }
    } else if (direction == "vertical") {
      for (let x = 0; x < width; x += spacing) {
        ctx.fillRect(x, 0, lineWidth, height);
      }
    } // else at an angle?

    return await canvasToImage(maskCanvas);
  };
}

/**
 * Manga-style screentone (circular dots)
 *
 * @param {number} width
 * @param {number} height
 * @param {number} strength
 */
export async function texPaperManga(width, height, strength = 1.0) {
  const maskCanvas = new OffscreenCanvas(width, height);
  const ctx = maskCanvas.getContext("2d");

  strength = Math.max(0, Math.min(1, strength));

  const minGap = 4;
  const maxGap = 10;
  const gap = Math.round(
    minGap + (1 - strength) * (maxGap - minGap),
  );

  const minRadius = 2;
  const maxRadius = Math.floor(gap / 2);
  const radius = Math.max(
    minRadius,
    Math.round(minRadius + strength * (maxRadius - minRadius)),
  );

  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  for (let y = gap / 2; y < height; y += gap) {
    for (let x = gap / 2; x < width; x += gap) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return await canvasToImage(maskCanvas);
}

export function stdStaticPapers() {
  // Immutable per spec (otherwise will break imports)
  // only add if required
  return [
    new Paper({
      staticId: "raw",
      name: "Raw",
      textureLoader: null,
    }),
    new Paper({
      staticId: "vertical-lines",
      name: "Vertical Lines",
      textureLoader: texPaperLinesInclined("vertical"),
    }),
    new Paper({
      staticId: "horizontal-lines",
      name: "Horizontal Lines",
      textureLoader: texPaperLinesInclined("horizontal"),
    }),
    new Paper({
      staticId: "screentone",
      name: "Screentone",
      textureLoader: texPaperManga,
    }),
  ];
}

// IDEA: speed curve: slower strokes => denser

export class Brush {
  constructor({
    name,
    spacing,
    size,
    substract = false,
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
    this.substract = substract;
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
    /** @type {ImageTexture} */
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
   * @param {amortizedSize} boolean
   */
  dab(ctx, pointer, amortizedSize = false) {
    const p = this.pressureCurve(pointer.pressure);
    if (p <= 0) return;

    const size = p *
      (amortizedSize ? Math.sqrt(Math.max(4 * this.size, 0.0)) : this.size);
    const ar = this.texture.width / Math.max(0.0001, this.texture.height);
    const angle = this.angleTransform?.(pointer.orientation) ??
      Math.random() * Math.PI * 2;
    const squishedAr = this.squashTransform?.(ar, pointer.tilt) ??
      (1 + 2 * pointer.tilt) * ar;

    ctx.save();

    ctx.globalAlpha = p;
    if (this.substract) {
      ctx.globalCompositeOperation = "destination-out";
    }

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
    // HACK: stroke will explode otherwise
    const amortizedSize = true; // !
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
      }, amortizedSize);
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
    /** @type {Paper | null} */
    this.paper = null;
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
    let { canvas } = this.renderer;
    if (this.paper) {
      canvas = this.paper.absorbInk(canvas);
    }

    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext("2d");

    // HQ downscale
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";

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
      let sourceCanvas;
      if (layer.paper) {
        sourceCanvas = layer.paper.absorbInk(layer.renderer.canvas);
      } else {
        sourceCanvas = layer.renderer.canvas;
      }

      const oldAlpha = mainContext.globalAlpha;
      mainContext.globalAlpha = layer.opacity;
      mainContext.drawImage(sourceCanvas, 0, 0);
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
  async resize(newWidth, newHeight) {
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
      await layer?.paper?.setParameters(
        layer.renderer.canvas.width,
        layer.renderer.canvas.height,
      );

      layer.renderer.context.putImageData(oldLayer, 0, 0);
    }
  }

  /**
   * @param {boolean} transparent
   */
  async getComposedImage(transparent) {
    return await canvasToImage(this.renderer.canvas, transparent);
  }

  getComposedImageData() {
    const { canvas, context } = this.renderer;
    return context.getImageData(0, 0, canvas.width, canvas.height);
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
          state.lastPos
        ) {
          if (layer.isVisible) {
            this.brush.stroke(
              layer.renderer.context,
              state.lastPos,
              event.pointer,
              // TODO: speed for speed curve
            );
            this.onStroke?.(event.pointer);
            state.lastPos = event.pointer;
          } else {
            this.onDrawingInvisbleLayer?.();
          }
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

  addListeners({
    onDrawingInvisbleLayer,
    onStroke,
  }) {
    if (typeof onDrawingInvisbleLayer != "function") {
      throw new Error("onDrawingInvisbleLayer expected a function");
    }

    this.onDrawingInvisbleLayer = onDrawingInvisbleLayer;
    this.onStroke = onStroke;
  }
}

/**
 * @param {string} password
 * @param {string} salt
 * @returns
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array([...salt, ...enc.encode(APP_SIGNATURE)]),
      iterations: 150_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * @param {ImageData} imageData
 * @param {string} password
 */
async function lockImageData(imageData, password) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    imageData.data.buffer,
  );

  return {
    scheme: "aes-gcm-pbkdf2-v1",
    width: imageData.width,
    height: imageData.height,
    buffer: ciphertext,
    iv,
    salt,
  };
}

/**
 * @param {payload} unknown
 * @param {string} password
 */
async function unlockImageData(payload, password) {
  switch (payload.scheme) {
    case "aes-gcm-pbkdf2-v1": {
      const key = await deriveKey(password, payload.salt);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: payload.iv },
        key,
        payload.buffer,
      );
      return new ImageData(
        new Uint8ClampedArray(plaintext),
        payload.width,
        payload.height,
      );
    }
    default:
      throw new Error("Unknown encryption scheme: " + payload.scheme);
  }
}

export class Serializer {
  /**
   * @param {string | null | undefined} userPassword
   */
  constructor(userPassword) {
    this.userPassword = userPassword || "";
  }

  /**
   * RKGK Binary Project Specification (Version 2)
   * I'd consider this a very pragmatic solution, technically a mini-file system.
   * A JSON header and a binary tail (refered within the JSON)
   *
   * @param {RkgkEngine} rkgk
   */
  async serialize(rkgk) {
    const binaryParts = [];
    let currentOffset = 0;

    // Layers and collect binary blobs (private)
    const layerMeta = await Promise.all(rkgk.layers.map(async (layer) => {
      const locked = await lockImageData(
        layer.getImageDataBuffer(),
        this.userPassword,
      );
      const buf = new Uint8Array(locked.buffer);

      const meta = {
        id: layer.id,
        isVisible: layer.isVisible,
        opacity: layer.opacity,
        paper: layer.paper
          ? {
            id: layer.paper.id,
            strength: layer.paper.strength,
          }
          : null,
        width: locked.width,
        height: locked.height,
        iv: Array.from(locked.iv),
        salt: Array.from(locked.salt),
        offset: currentOffset,
        length: buf.byteLength,
      };

      binaryParts.push(buf);
      currentOffset += buf.byteLength;
      return meta;
    }));

    // Final composed image (public)
    // Settled: Use Public Provenance (C2PA/Manifest)
    // This allows the work to remain encrypted/private while
    // exposing a signed, public "Content Credential" to verify ownership
    // TODO: Having a small permission mask for the v3 would be great! (view, edit)
    const finalLocked = await lockImageData(
      rkgk.getComposedImageData(),
      APP_SIGNATURE,
    );
    const finalBuf = new Uint8Array(finalLocked.buffer);
    const finalMeta = {
      width: finalLocked.width,
      height: finalLocked.height,
      iv: Array.from(finalLocked.iv),
      salt: Array.from(finalLocked.salt),
      offset: currentOffset,
      length: finalBuf.byteLength,
    };
    binaryParts.push(finalBuf);

    // Best of both words: JSON Header
    const jsonPayload = {
      version: 2,
      title: rkgk.title,
      currentLayerId: rkgk.currentLayerId,
      encryption: { scheme: "aes-gcm-pbkdf2-v1" },
      layers: layerMeta,
      finalImage: finalMeta,
    };

    const jsonBytes = new TextEncoder().encode(JSON.stringify(jsonPayload));

    // Layout: MAGIC(4) | JSON_LEN(4) | JSON | BINARY_BLOBS
    const totalHeaderSize = 4 + 4 + jsonBytes.byteLength;
    console.debug("Building", totalHeaderSize);
    const finalBlob = new Blob([
      new TextEncoder().encode("RKGK"),
      new Uint32Array([jsonBytes.byteLength]), // ! Little Endian
      jsonBytes,
      ...binaryParts, // ALL encrypted images
    ], { type: "application/octet-stream" });

    return finalBlob;
  }

  /**
   * @param {RkgkEngine} rkgk
   * @param {Blob} blob
   */
  async from(rkgk, blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // Header
    const magic = new TextDecoder().decode(arrayBuffer.slice(0, 4));
    if (magic !== "RKGK") throw new Error("Not a valid RKGK file");

    // JSON Header
    const jsonLen = view.getUint32(4, true);
    const jsonStart = 8;
    const jsonEnd = jsonStart + jsonLen;
    const jsonData = new TextDecoder().decode(
      arrayBuffer.slice(jsonStart, jsonEnd),
    );
    const meta = JSON.parse(jsonData);

    // Update engine
    rkgk.title = meta.title ?? "untitled";
    rkgk.layers = [];
    rkgk.currentLayerId = meta.currentLayerId;
    const binaryBaseOffset = jsonEnd;

    const recoverableErrors = [];

    const getPayload = (l) => {
      const encryptedBuffer = arrayBuffer.slice(
        binaryBaseOffset + l.offset,
        binaryBaseOffset + l.offset + l.length,
      );

      return {
        scheme: meta.encryption.scheme,
        width: l.width,
        height: l.height,
        paper: l?.paper ?? null,
        iv: new Uint8Array(l.iv),
        salt: new Uint8Array(l.salt),
        buffer: encryptedBuffer,
      };
    };

    const stdPapers = stdStaticPapers();

    // Decrypt Layers
    for (const l of meta.layers) {
      try {
        const payload = getPayload(l);
        const imgData = await unlockImageData(payload, this.userPassword);
        const layer = new Layer(imgData.width, imgData.height);

        layer.id = l.id;
        layer.isVisible = l.isVisible;
        layer.opacity = l.opacity;
        layer.renderer.context.putImageData(imgData, 0, 0);
        layer.snapshot();

        const paperInstance = stdPapers.find((p) => p.id == payload.paper?.id);
        if (paperInstance) {
          await paperInstance.setParameters(
            layer.renderer.canvas.width,
            layer.renderer.canvas.height,
            payload.paper?.strength,
          );
          layer.paper = paperInstance;
        }

        if (rkgk.layers.length == 0) {
          await rkgk.resize(imgData.width, imgData.height);
        }
        rkgk.layers.push(layer);
      } catch (err) {
        recoverableErrors.push(
          new Error(
            `[Layer: ${l?.id?.substring(0, 20)}..] Decryption failed: ${
              err?.toString() || "unknown"
            }`,
            { cause: err },
          ),
        );
      }
    }

    if (recoverableErrors.length > 0) {
      try {
        const payload = getPayload(meta.finalImage);
        const imgData = await unlockImageData(payload, APP_SIGNATURE);
        rkgk.layers = [];
        await rkgk.resize(imgData.width, imgData.height);
        rkgk.currentLayerId = rkgk.addLayer();
        const placeholderLayer = rkgk.getLayer(rkgk.currentLayerId);

        placeholderLayer.renderer.context.putImageData(imgData, 0, 0);
        recoverableErrors.push(new Error("WARN: will load overview instead"));
      } catch (err) {
        rkgk.currentLayerId = rkgk.addLayer();
        console.error(err);
        recoverableErrors.push(
          new Error(
            `Composed image decryption failed, was this generated by another App perhaps?: ${
              err?.toString() || "unknown"
            }`,
            { cause: err },
          ),
        );
      }
    }

    return recoverableErrors;
  }
}
