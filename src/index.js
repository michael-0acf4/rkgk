import { RkgkEngine } from "./rkgk/rkgk.js";
import { stdBrushes } from "./rkgk/rkgk-brushes.js";
import {
  BrushMenu,
  CanvasViewport,
  LayerMenu,
  updateBrushThumbnail,
  updateLayerThumbnail,
} from "./ui/ui-comp.js";
import { FloatingWindow } from "./ui/ui-window.js";

const canvas = document.getElementById("canvas");
const rkgk = new RkgkEngine(canvas);
rkgk.setupDOMEvents({
  ignoreUponOneOfModifierKeys: [
    "alt", // Reserved for tje UI
  ],
}); // !
const brushes = stdBrushes();
rkgk.currentLayerId = rkgk.addLayer();

// rkgk.drawDebugNumber();

async function main() {
  for (const brush of brushes) {
    await brush.setFilter("#000000", 1.0);
  }
  rkgk.brush = brushes[0];

  new BrushMenu(
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
    { canvas, rkgk },
    {
      onZoom: ({ scale }) => {
        rkgk.scale = scale;
      },
      onRedo: (direction) => {
        rkgk.historyTravel(direction);
      },
      onPan: ({ x, y }) => {},
    },
  );

  new LayerMenu(
    document.getElementById("layerMenu"),
    { rkgk },
  );

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

  // Global
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file?.type.startsWith("image/")) return;

    const url = URL.createObjectURL(file);
    const win = new FloatingWindow(document.body, {
      title: file.name,
      width: 400,
      height: null,
      x: e.clientX,
      y: e.clientY,
      showCancel: false,
      makeUnique: true,
    });

    win.setContent((root) => {
      const img = document.createElement("img");
      img.src = url;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.display = "block";

      // Disable ability to drag and drop inner images
      // otherwise we can trigger unwanted accidental dup windows
      img.draggable = false;

      root.appendChild(img);
    });
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
}

main()
  .catch((e) => {
    throw e;
  });
