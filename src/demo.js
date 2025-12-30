import { Brush, RkgkEngine } from "./rkgk.js";
import { texProceduralMarker } from "./rkgk-brushes.js";

async function main() {
  const texMarker = texProceduralMarker(10);
  const brush = new Brush({
    name: "Awesome Marker",
    textureLoader: texMarker,

    // Angle at which the texture is drawn
    angleTransform: (_t) => Math.random() * 2 * Math.PI,

    // After applying the texture orientation, we can do a rich deformation with tablet pen tilt data
    // deformation vector := v ~ new - old in drawing space
    squashTransform: (ar, _tilt) => ar,

    // Texture spacing in between two points
    spacing: 0.25,

    // Texture will be normalized in drawing space but higher size mean higher texture fidelity
    size: 10,

    // TODO: quantize
    // https://docs.thesevenpens.com/drawtab/core-features/pen-pressure/pen-pressure-curve/implementing-pressure-curves
    pressureCurve: (p) => Math.sqrt(p),
  });

  await brush.setColor("#dc2626fa");

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

  async function updateBrushThumb() {
    const img = await brush.getThumbnail(120, 40);
    const div = document.getElementById("thumb-brush");
    div.innerHTML = "";
    img.drawable.style = "border: 2px solid black";
    div.innerHTML = "";
    div.appendChild(img.drawable);
  }

  async function updateCanvasThumb() {
    const img = await rkgk.getLayer(rkgk.currentLayerId).getThumbnail(120, 100);
    const div = document.getElementById("thumb-layer");
    div.innerHTML = "";
    img.drawable.style = "border: 2px solid black";
    div.innerHTML = "";
    div.appendChild(img.drawable);
  }

  await updateBrushThumb();
  await updateCanvasThumb();

  // In this demo, we change the brush color as we change layer
  // for every 2s
  const colorExamples = ["black", "#335667b9", "#a0d"];
  let activeLayerIdx = rkgk.layers.findIndex((l) =>
    l.id == rkgk.currentLayerId
  );
  setInterval(async () => {
    activeLayerIdx += 1;
    activeLayerIdx %= rkgk.layers.length;
    rkgk.currentLayerId = rkgk.layers[activeLayerIdx].id;
    const color = colorExamples[activeLayerIdx % colorExamples.length];
    await brush.setColor(color);
    await updateBrushThumb();
  }, 2000);

  setInterval(async () => {
    await updateCanvasThumb();
  }, 500);
}

main().catch((e) => {
  throw e;
});
