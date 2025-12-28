import { Brush, BrushTexture, RkgkEngine } from "./rkgk.js";

const tex = await Promise.all([
  BrushTexture.proceduralSoft(10), // slow
  BrushTexture.fromImage("textures/pencil.png"),
  BrushTexture.fromImage("textures/grunge.png"),
]);

const brush = new Brush({
  texture: tex[2],
  spacing: 0.25,
  size: 10,
  // TODO: quantize
  // https://docs.thesevenpens.com/drawtab/core-features/pen-pressure/pen-pressure-curve/implementing-pressure-curves
  pressureCurve: (p) => Math.sqrt(p),
});

const canvas = document.getElementById("canvas");
const rkgk = new RkgkEngine(canvas);
rkgk.brush = brush;
// rkgk.brush = softCircularBrush;
rkgk.currentLayerId = rkgk.addLayer();

let count = 4;
setInterval(() => {
  rkgk.currentLayerId = rkgk.addLayer();
  if (count < 0) {
    const id = rkgk.layers.at(0)?.id;
    rkgk.removeLayer(id);
  }
  console.log("next count plz");
  count--;
}, 2000);

rkgk.setupDOMEvents(); // !

function draw() {
  rkgk.render();
  requestAnimationFrame(draw);
}
draw();
