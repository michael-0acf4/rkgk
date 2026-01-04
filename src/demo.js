import { Brush, RkgkEngine, stdStaticPapers } from "./rkgk/rkgk.js";
import { texProceduralHard, texProceduralMarker } from "./rkgk/rkgk-brushes.js";

async function main() {
  const texMarker = texProceduralMarker(10);
  const brush = new Brush({
    name: "Awesome Marker",
    // Texture spacing in between two points
    spacing: 0.1,
    // Texture will be normalized in drawing space but higher size mean higher texture fidelity
    size: 10,
    // A texture loader generates a functino that can output an Image object given a color on the fly
    // textureLoader: texMarker,
    textureLoader: texProceduralHard(10),
    // Angle at which the texture is drawn
    angleTransform: (_t) => Math.random() * 2 * Math.PI,
    // After applying the texture orientation, we can do a rich deformation with tablet pen tilt data
    // deformation vector := v ~ new - old in drawing space
    // which we express by changing the aspect ratio
    squashTransform: (ar, _tilt) => ar,
    // TODO: quantize
    // https://docs.thesevenpens.com/drawtab/core-features/pen-pressure/pen-pressure-curve/implementing-pressure-curves
    pressureCurve: (p) => Math.sqrt(p),
  });

  // Compiles a brush texture into a concrete colored Image object
  await brush.setFilter("black");

  const canvas = document.getElementById("canvas");
  const rkgk = new RkgkEngine(canvas);
  rkgk.brush = brush;
  rkgk.currentLayerId = rkgk.addLayer();
  rkgk.currentLayerId = rkgk.addLayer();
  rkgk.currentLayerId = rkgk.addLayer();

  // We can set a paper type
  const papers = stdStaticPapers();
  let i = 0;
  for (const layer of rkgk.layers) {
    layer.paper = papers[i % papers.length];
    await layer.paper.setParameters(canvas.width, canvas.height, 1.0);
    i++;
  }

  // Rkgk will bind pointer related events to the canvas
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
    const layer = rkgk.getLayer(rkgk.currentLayerId);
    const img = await layer.getThumbnail(120, 100);
    const paperType = document.getElementById("paper-type");
    paperType.innerText = `Paper: ${layer.paper.name}`;

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
    await brush.setFilter(color);
    await updateBrushThumb();
  }, 2000);

  setInterval(async () => {
    await updateCanvasThumb();
  }, 500);
}

main().catch((e) => {
  throw e;
});
