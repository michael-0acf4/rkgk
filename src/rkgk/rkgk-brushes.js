import { Brush, canvasToImage } from "./rkgk.js";

/**
 * @param {string} url
 * @param {string} color
 */
export function texFromImage(url) {
  return async (color, hardness) => {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.globalAlpha = hardness ?? ctx.globalAlpha;
    ctx.drawImage(img, 0, 0);

    // Composite source in preserves non-transparent colors canvas
    // could be useful later idk
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";

    return await canvasToImage(canvas);
  };
}

/**
 * @param {number} size
 */
export function texProceduralSoft(size) {
  return async (color, hardness) => {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.globalAlpha = hardness ?? ctx.globalAlpha;

    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    return await canvasToImage(canvas);
  };
}

/**
 * @param {number} size
 */
export function texProceduralHard(size) {
  return async (color, hardness) => {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.globalAlpha = hardness ?? ctx.globalAlpha;

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    return await canvasToImage(canvas);
  };
}

/**
 * @param {number} size
 */
export function texProceduralMarker(size) {
  return async (color, hardness) => {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = color;
    ctx.globalAlpha = hardness ?? ctx.globalAlpha;
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i + 3] = Math.random() * 255;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.putImageData(imgData, 0, 0);

    return await canvasToImage(canvas);
  };
}

/**
 * @param {number} size
 */
export function texEraser(size) {
  return async (_color, _hardness) => {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");

    const imgData = ctx.createImageData(size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i + 0] = 255;
      imgData.data[i + 1] = 255;
      imgData.data[i + 2] = 255;
      imgData.data[i + 3] = Math.random() * 255;
    }
    ctx.putImageData(imgData, 0, 0);

    return await canvasToImage(canvas);
  };
}

export function stdBrushes() {
  return [
    new Brush({
      name: "Sketch",
      spacing: 0.25,
      size: 10,
      textureLoader: texFromImage("textures/pencil.png"),
      angleTransform: (_t) => Math.random() * 2 * Math.PI,
      squashTransform: (ar, _tilt) => ar,
      pressureCurve: (p) => p,
    }),
    new Brush({
      name: "Pencil",
      spacing: 0.25,
      size: 10,
      textureLoader: texFromImage("textures/pencil.png"),
      angleTransform: (t) => t,
      squashTransform: (ar, tilt) => (1 + tilt) * ar,
      pressureCurve: (p) => p,
    }),
    new Brush({
      name: "Marker",
      spacing: 0.25,
      size: 10,
      textureLoader: texProceduralMarker(10),
      angleTransform: (_t) => Math.random() * 2 * Math.PI,
      squashTransform: (ar, tilt) => (1 + 2 * tilt) * ar,
      pressureCurve: (p) => p,
    }),
    new Brush({
      name: "Soft Brush",
      spacing: 0.1,
      size: 10,
      textureLoader: texProceduralSoft(10),
      angleTransform: (_t) => Math.random() * 2 * Math.PI,
      squashTransform: (ar, _tilt) => ar,
      pressureCurve: (p) => Math.sqrt(p),
    }),
    new Brush({
      name: "Hard Brush",
      spacing: 0.1,
      size: 10,
      textureLoader: texProceduralHard(10),
      angleTransform: (t) => t,
      squashTransform: (ar, tilt) => (1 + 2 * tilt) * ar,
      pressureCurve: (p) => Math.sqrt(p),
    }),
    new Brush({
      name: "Eraser",
      spacing: 0.25,
      size: 10,
      textureLoader: texEraser(10),
      angleTransform: (_t) => Math.random() * 2 * Math.PI,
      squashTransform: (ar, _tilt) => ar,
      pressureCurve: (p) => Math.sqrt(p),
    }),
  ];
}
