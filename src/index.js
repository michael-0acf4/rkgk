import { Brush, RkgkEngine, texFromImage, texProceduralSoft } from "./rkgk.js";
async function main() {
  const texSoft = texProceduralSoft(10);
  const texPencil = texFromImage("textures/pencil.png");

  const brush = new Brush({
    textureLoader: texPencil,
    spacing: 0.25,
    size: 10,
    // TODO: quantize
    // https://docs.thesevenpens.com/drawtab/core-features/pen-pressure/pen-pressure-curve/implementing-pressure-curves
    pressureCurve: (p) => Math.exp(p),
  });

  brush.setColor("#b5c7d02c");

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
      rkgk.resize(null, 600);
    }
    console.log("next count plz");
    count--;
  }, 2000);

  rkgk.setupDOMEvents(); // !

  function draw() {
    rkgk.pollState();
    rkgk.render();
    requestAnimationFrame(draw);
  }
  draw();
}

main().catch((e) => {
  throw e;
});
