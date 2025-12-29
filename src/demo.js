import { Brush, RkgkEngine, texFromImage, texProceduralSoft } from "./rkgk.js";

async function main() {
  const texSoft = texProceduralSoft(10);
  const texPencil = texFromImage("textures/pencil.png");

  const brush = new Brush({
    name: "Pencil",
    textureLoader: texPencil,
    spacing: 0.25,
    size: 10,
    // TODO: quantize
    // https://docs.thesevenpens.com/drawtab/core-features/pen-pressure/pen-pressure-curve/implementing-pressure-curves
    pressureCurve: (p) => Math.sqrt(p),
  });

  brush.setColor("#b5c7d02c");

  const canvas = document.getElementById("canvas");
  const rkgk = new RkgkEngine(canvas);
  rkgk.brush = brush;
  rkgk.currentLayerId = rkgk.addLayer();
  rkgk.currentLayerId = rkgk.addLayer();
  rkgk.currentLayerId = rkgk.addLayer();

  rkgk.setupDOMEvents({
    ignoreUponOneOfModifierKeys: [],
  }); // !

  function draw() { // !
    rkgk.pollState();
    rkgk.render();
    requestAnimationFrame(draw);
  }
  draw();


  // In this demo, we change the brush color as we change layers
  // every 2s
  const colorExamples = ["black", "#b5c7d02c", "#a0d"];
  let activeLayerIdx = rkgk.layers.findIndex((l) =>
    l.id == rkgk.currentLayerId
  );
  setInterval(async () => {
    activeLayerIdx += 1;
    activeLayerIdx %= rkgk.layers.length;
    rkgk.currentLayerId = rkgk.layers[activeLayerIdx].id;
    const color = colorExamples[activeLayerIdx % colorExamples.length];
    await brush.setColor(color);
  }, 2000);
}

main().catch((e) => {
  throw e;
});
