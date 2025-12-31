import { RkgkEngine } from "./rkgk.js";
import { stdBrushes } from "./rkgk-brushes.js";
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
const brushes = stdBrushes();

async function main() {
  for (const brush of brushes) {
    await brush.setFilter("#000000", 1.0);
  }
  rkgk.brush = brushes[0];

  const _ = new BrushMenu(
    document.getElementById("brushMenu"),
    {
      brushes,
      activeBrushId: rkgk.brush.id,
      onSelectBrush: (brush) => {
        rkgk.brush = brush;
      },
      onChangeSettings: async ({ brushId, settings }) => {
        const brush = brushes.find((b) => b.id === brushId);
        if (!brush) return;
        brush.size = settings.size;
        await brush.setFilter(settings.color, settings.hardness);
        updateBrushThumbnail(brush).catch(console.error);
      },
    },
  );

  new CanvasViewport(
    canvas,
    {
      onZoom: (z) => {
        rkgk.scale = z.scale;
      },
      onPan: (p) => {},
    },
  );

  rkgk.currentLayerId = rkgk.addLayer();
  const layerMenu = new LayerMenu(
    document.getElementById("layerMenu"),
    rkgk.currentLayerId,
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
      onInsert({ fromId, toId }) {
        const layers = rkgk.layers;

        const fromIndex = layers.findIndex((l) => l.id == fromId);
        const toIndex = layers.findIndex((l) => l.id == toId);

        if (fromIndex < 0 || toIndex < 0) {
          console.error(
            "Could not insert swap: one of the operands is undefined",
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
