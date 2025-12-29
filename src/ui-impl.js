import {
  Brush,
  RkgkEngine,
  texEraser,
  texFromImage,
  texProceduralSoft,
} from "./rkgk.js";
import {
  BrushMenu,
  CanvasViewport,
  LayerMenu,
  updateBrushThumbnail,
  updateLayerThumbnail,
} from "./ui-comp.js";

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

        Promise.all(brushes.map(async (brush) => {
          brush.size = s.size;
          await brush.setColor(s.color);
          return updateBrushThumbnail(brush);
        }))
          .catch(console.error);

        const layer = rkgk.getLayer(rkgk.currentLayerId);
        if (layer) {
          layer.opacity = s.opacity;
        }
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
        rkgk.addLayer();
        layerMenu.setLayers(rkgk.layers);

        Promise.all(rkgk.layers.map(updateLayerThumbnail))
          .catch(console.error);
      },
      onRemoveLayer(id) {
        rkgk.removeLayer(id);
        layerMenu.setLayers(rkgk.layers);
      },
      onSwap({ fromId, toId }) {
        const layers = rkgk.layers;

        const fromIndex = layers.findIndex((l) => l.id == fromId);
        const toIndex = layers.findIndex((l) => l.id == toId);

        if (fromIndex < 0 || toIndex < 0) {
          console.error(
            "Could not swap: one of the operands is undefined",
            fromIndex,
            fromId,
            "vs",
            toIndex,
            toId,
          );
          return;
        }

        const [moved] = layers.splice(fromIndex, 1);
        layers.splice(toIndex, 0, moved);

        layerMenu.setLayers(layers);
        Promise.all(layers.map(updateLayerThumbnail))
          .catch(console.error);
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

  // Thumbs
  Promise.all(rkgk.layers.map(updateLayerThumbnail))
    .catch(console.error);
  Promise.all(brushes.map(updateBrushThumbnail))
    .catch(console.error);

  setInterval(async () => {
    const layer = rkgk.getLayer(rkgk.currentLayerId);
    if (layer) {
      await updateLayerThumbnail(layer);
    }
  }, 1000);
}

main()
  .catch((e) => {
    throw e;
  });
