import {
  Brush,
  RkgkEngine,
  texEraser,
  texFromImage,
  texProceduralSoft,
} from "./rkgk.js";
import { BrushMenu, CanvasViewport, LayerMenu } from "./ui-comp.js";

const canvas = document.getElementById("canvas");
const rkgk = new RkgkEngine(canvas);
rkgk.setupDOMEvents({
  ignoreUponOneOfModifierKeys: [
    "alt", // Reserved for tje UI
  ],
}); // !

const brushes = [
  new Brush({
    name: "Sketch",
    textureLoader: texFromImage("textures/pencil.png"),
    spacing: 0.25,
    size: 10,
    pressureCurve: (p) => p,
  }),
  new Brush({
    name: "Soft Brush",
    textureLoader: texProceduralSoft(10),
    spacing: 0.25,
    size: 10,
    pressureCurve: (p) => Math.sqrt(p),
  }),
  new Brush({
    name: "Eraser",
    textureLoader: texEraser(10),
    spacing: 0.25,
    size: 10,
    pressureCurve: (p) => Math.sqrt(p),
  }),
];

async function main() {
  for (const brush of brushes) {
    await brush.setColor("#000");
  }
  rkgk.brush = brushes[0];

  new BrushMenu(
    document.getElementById("brushMenu"),
    {
      brushes,
      activeBrushId: "round",
      onSelectBrush: (brush) => {
        console.log("engine: select brush", brush);
        rkgk.brush = brush;
      },
      onChangeSettings: (s) => {
        console.log("engine: select settings", s);
        rkgk.brush.size = s.size;
        rkgk.brush.setColor(s.color).catch(console.error);
      },
    },
  );

  new CanvasViewport(
    canvas,
    {
      onZoom: (z) => {
        rkgk.scale = z.scale;
        console.log("engine: zoom", z);
      },
      onPan: (p) => console.log("engine: pan", p),
    },
  );

  const layerMenu = new LayerMenu(
    document.getElementById("layerMenu"),
    {
      onAddLayer() {
        rkgk.currentLayerId = rkgk.addLayer();
        layerMenu.setLayers(rkgk.layers);
      },
      onRemoveLayer(id) {
        rkgk.removeLayer(id);
        layerMenu.setLayers(rkgk.layers);
      },
      onSwap({ fromId, toId }) {
        const a = rkgk.layers.findIndex((l) => l.id == fromId);
        const b = rkgk.layers.findIndex((l) => l.id == toId);
        if (a < 0 || b < 0) {
          console.error(
            "Could not swap: one of the oeprand is undefined",
            a,
            fromId,
            "vs",
            b,
            toId,
          );
          return;
        }

        [rkgk.layers[a], rkgk.layers[b]] = [rkgk.layers[b], rkgk.layers[a]];

        console.log(rkgk.layers[a], rkgk.layers[b]);

        layerMenu.setLayers(rkgk.layers);
      },
      onActiveChange(id) {
        console.log("engine: active layer", id);
        rkgk.currentLayerId = id;
      },
    },
  );

  rkgk.currentLayerId = rkgk.addLayer();
  layerMenu.setLayers(rkgk.layers);

  function draw() {
    rkgk.pollState();
    rkgk.render();
    requestAnimationFrame(draw);
  }
  draw();
}

main()
  .catch((e) => {
    throw e;
  });
