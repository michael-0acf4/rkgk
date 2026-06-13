export function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    const val = v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return Math.round(val * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

export function hexToHsv(hex) {
  let r = 0, g = 0, b = 0;
  const h = (hex || "").replace("#", "");
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length >= 6) {
    r = parseInt(h[0] + h[1], 16);
    g = parseInt(h[2] + h[3], 16);
    b = parseInt(h[4] + h[5], 16);
  }
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hh = ((b - r) / d + 2) * 60;
    else hh = ((r - g) / d + 4) * 60;
  }
  return { h: hh, s, v };
}

const SQ = 96;
const BAR_W = 12;
const BAR_H = SQ;

export class ColorPicker {
  constructor({ initialColor, onChange } = {}) {
    this.onChange = onChange;
    this.setVal(initialColor || "#000000");
    this.dragging = false;

    this.root = document.createElement("div");
    this.root.style.cssText = `
      display: flex; flex-direction: column; gap: 4px;
      padding: 4px 0; user-select: none; width: 112px;
    `;

    const row = document.createElement("div");
    row.style.cssText = `
      display: flex; gap: 4px; align-items: stretch;
    `;

    this.sv = document.createElement("canvas");
    this.sv.width = SQ;
    this.sv.height = SQ;
    this.sv.style.cssText = `
      width: ${SQ}px; height: ${SQ}px;
      cursor: crosshair; border: 1px solid #888;
      border-radius: 2px; flex-shrink: 0;
    `;
    this.sv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.dragging = true;
      this.pickSV(e);
    });

    this.hueBar = document.createElement("canvas");
    this.hueBar.width = BAR_W;
    this.hueBar.height = BAR_H;
    this.hueBar.style.cssText = `
      width: ${BAR_W}px; height: ${BAR_H}px;
      cursor: crosshair; border: 1px solid #888;
      border-radius: 2px; flex-shrink: 0;
    `;
    this.hueBar.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.dragging = true;
      this.pickHue(e);
    });

    row.appendChild(this.sv);
    row.appendChild(this.hueBar);
    this.root.appendChild(row);

    const bottom = document.createElement("div");
    bottom.style.cssText = `
      display: flex; gap: 4px; align-items: center;
    `;

    const hexLabel = document.createElement("span");
    hexLabel.textContent = "#";
    hexLabel.style.cssText = "font-size: 11px; font-family: monospace;";

    this.hexInput = document.createElement("input");
    this.hexInput.type = "text";
    this.hexInput.maxLength = 6;
    this.hexInput.style.cssText = `
      flex: 1; font-family: monospace; font-size: 11px;
      padding: 1px 3px; border: 1px solid #aaa; border-radius: 2px;
      text-transform: uppercase; min-width: 0;
    `;
    this.hexInput.addEventListener("input", () => {
      const val = this.hexInput.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
      if (val.length === 6) {
        this.setVal("#" + val);
        this.render();
        this.emit();
      }
      this.hexInput.value = val;
    });

    bottom.appendChild(hexLabel);
    bottom.appendChild(this.hexInput);
    this.root.appendChild(bottom);

    this.onPointerMove = (e) => {
      if (!this.dragging) return;
      if (e.target === this.sv || e.target === this.hueBar) {
        const r = e.target.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * e.target.width;
        const y = ((e.clientY - r.top) / r.height) * e.target.height;
        if (e.target === this.sv) {
          this.pickSVVal(x, y);
        } else {
          this.pickHueVal(y);
        }
      }
    };

    this.onPointerUp = () => {
      this.dragging = false;
    };

    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);

    this.render();
  }

  pickSV(e) {
    const r = this.sv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SQ;
    const y = ((e.clientY - r.top) / r.height) * SQ;
    this.pickSVVal(x, y);
  }

  pickSVVal(x, y) {
    this.saturation = Math.max(0, Math.min(1, x / SQ));
    this.value = Math.max(0, Math.min(1, 1 - y / SQ));
    this.render();
    this.emit();
  }

  pickHue(e) {
    const r = this.hueBar.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * BAR_H;
    this.pickHueVal(y);
  }

  pickHueVal(y) {
    this.hue = Math.max(0, Math.min(360, (y / BAR_H) * 360));
    this.render();
    this.emit();
  }

  setVal(hex) {
    const { h, s, v } = hexToHsv(hex || "#000000");
    this.hue = h;
    this.saturation = s;
    this.value = v;
  }

  setColor(hex) {
    this.setVal(hex);
    this.render();
    this.emit();
  }

  emit() {
    const hex = hsvToHex(this.hue, this.saturation, this.value);
    this.onChange?.(hex);
  }

  render() {
    const hex = hsvToHex(this.hue, this.saturation, this.value);

    const svCtx = this.sv.getContext("2d");
    for (let px = 0; px < SQ; px++) {
      for (let py = 0; py < SQ; py++) {
        const s = px / SQ;
        const v = 1 - py / SQ;
        svCtx.fillStyle = hsvToHex(this.hue, s, v);
        svCtx.fillRect(px, py, 1, 1);
      }
    }
    const cx = this.saturation * SQ;
    const cy = (1 - this.value) * SQ;
    svCtx.beginPath();
    svCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    svCtx.lineWidth = 1.5;
    svCtx.strokeStyle = "#fff";
    svCtx.stroke();
    svCtx.beginPath();
    svCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    svCtx.strokeStyle = "#333";
    svCtx.setLineDash([2, 2]);
    svCtx.stroke();
    svCtx.setLineDash([]);

    const hCtx = this.hueBar.getContext("2d");
    for (let py = 0; py < BAR_H; py++) {
      const h = (py / BAR_H) * 360;
      hCtx.fillStyle = hsvToHex(h, 1, 1);
      hCtx.fillRect(0, py, BAR_W, 1);
    }
    const hy = (this.hue / 360) * BAR_H;
    hCtx.fillStyle = "#fff";
    hCtx.fillRect(0, hy - 2, BAR_W, 4);
    hCtx.strokeStyle = "#333";
    hCtx.lineWidth = 1;
    hCtx.strokeRect(0, hy - 2, BAR_W, 4);

    this.hexInput.value = hex.slice(1);
  }
}
