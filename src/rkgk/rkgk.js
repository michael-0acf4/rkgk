/** @typedef {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}} Renderer */
/** @typedef {"down" | "up" | "move" | "release" } EventKind */
/** @typedef {{ x: number, y: number, pressure: number, tilt: number, orientation: number }} PointerData */
/** @typedef {{ kind: EventKind, pointer: PointerData, pointerId: number | null }} RkgkEvent */
/** @typedef {{ lastPos: PointerData, drawing: boolean, activePointerId: number | null }} EventState */
/** @typedef {{ drawable: HTMLImageElement, width: number, height: number }} BrushTexture */
/** @typedef {{ offsetX: number, offsetY: number, scale: number }} ViewTransformation */

/**
 * WARNING!
 * APP_SIGNATURE does not protecc, this script is PUBLIC, so it is merly just a provenance stamp for hints.
 */
const APP_SIGNATURE = "rkgk-v1";

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
  }) {
    if (typeof onDrawingInvisbleLayer != "function") {
      throw new Error("onDrawingInvisbleLayer expected a function");
    }

    this.onDrawingInvisbleLayer = onDrawingInvisbleLayer;
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
   *
   * I'd consider this a very pragmatic solution, technically a mini-file system.
   *
   * A JSON header and a binary tail (refered within the JSON)
   *
   * A hybrid binary/JSON format for storing layered canvas projects with
   * AES-GCM encryption.
   * * FILE STRUCTURE:
   * ```
   * +--------+-----------+-------------------+----------------------------+
   * | Offset | Size (B)  | Name              | Description                |
   * +--------+-----------+-------------------+----------------------------+
   * | 0      | 4         | Magic Number      | Constant ASCII "RKGK"      |
   * | 4      | 4         | JSON Length       | Uint32 (LE) size of Header |
   * | 8      | N         | JSON Header       | UTF-8 Encoded Metadata     |
   * | 8 + N  | Variable  | Binary Payload    | Concatenated Encrypted     |
   * |        |           |                   | Image Data Blobs           |
   * +--------+-----------+-------------------+----------------------------+
   * ```
   *
   * * JSON HEADER SCHEMA:
   * ```
   * {
   *  "title": string,              // Project name
   *  "currentLayerId": string,     // ID of the active layer
   *  "encryption": {
   *    "scheme": string            // "aes-gcm-pbkdf2-v1"
   *   },
   *  "layers": [                   // Array of layer metadata
   *  {
   *    "id": string,
   *    "isVisible": boolean,
   *    "opacity": number,
   *    "width": number,
   *    "height": number,
   *    "iv": number[],           // 12-byte Initialization Vector
   *    "salt": number[],         // 16-byte PBKDF2 Salt
   *    "offset": number,         // Byte offset relative to Binary Payload start
   *    "length": number          // Size of encrypted buffer in bytes
   *  }
   * ],
   * "finalImage": {               // Flattened preview metadata
   *   "offset": number,
   *   "length": number,
   *   ...cryptoMeta
   *  }
   * }
   * ```
   * 1. Key Derivation: PBKDF2 (SHA-256, 150k iterations)
   * 2. Algorithm: AES-GCM (256-bit key)
   * 3. Salt: Unique per layer, which is mixed with an optional APP_SIGNATURE at derivation time
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
        iv: new Uint8Array(l.iv),
        salt: new Uint8Array(l.salt),
        buffer: encryptedBuffer,
      };
    };

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

        if (rkgk.layers.length === 0) {
          rkgk.resize(imgData.width, imgData.height);
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
        rkgk.resize(imgData.width, imgData.height);
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
