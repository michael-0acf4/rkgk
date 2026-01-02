import { Brush, RkgkEngine, Serializer } from "../rkgk/rkgk.js";
import { errorWindow } from "./ui-window.js";

const suffix = "v1";
const DB_NAME = "RkgkStorage-" + suffix;
const STORE_NAME = "BinaryData-" + suffix;

const SETTINGS_KEY = "settings-" + suffix;
const RKGK_KEY = "rkgk-" + suffix;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.onerror);
  });
}

/**
 * @param {string} id
 * @param {unknown} data
 */
export async function saveToDisk(id, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(data, id); // 'data' can be your 200MB ArrayBuffer
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * @param {string} id
 */
export async function loadFromDisk(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearTemporaryState() {
  await saveToDisk(RKGK_KEY, null);
  await saveToDisk(SETTINGS_KEY, null);
}

/**
 * @param {RkgkEngine} rkgk
 * @param {Brush[]} brushes
 */
export async function persistTemporaryState(rkgk, brushes) {
  const s = new Serializer(null);
  const project = await s.serialize(rkgk);
  await saveToDisk(RKGK_KEY, project);

  if (!rkgk.brush) {
    rkgk.brush = brushes[0];
  }

  const currentBrush = brushes.find((b) => b.id == rkgk.brush.id);
  await saveToDisk(
    SETTINGS_KEY,
    JSON.stringify({
      currentBrushName: currentBrush.name,
      brushes: brushes.map((b) => ({
        name: b.name,
        color: b.color,
        hardness: b.hardness,
        size: b.size,
      })),
    }),
  );

  console.warn("Saved to disk", rkgk.title, "brushes", brushes.length);
}

/**
 * @param {RkgkEngine} rkgk
 * @param {Brush[]} brushes
 */
export async function loadTemporaryState(rkgk, brushes) {
  // rkgk
  const project = await loadFromDisk(RKGK_KEY);
  if (!project) {
    throw new Error("No state to restore from");
  }
  const s = new Serializer(null);
  const errors = await s.from(rkgk, project);
  if (errors.length > 0) {
    errorWindow("Failed restoring some of the state", errors);
  }

  // brushes
  const settings = JSON.parse(await loadFromDisk(SETTINGS_KEY));
  if (settings) {
    rkgk.brush = brushes[0];
    for (const brush of brushes) {
      if (brush.name == settings?.currentBrushName) {
        rkgk.brush = brush;
      }
      const currentSetting = settings.brushes.find((s) => s.name == brush.name);
      if (currentSetting.size) {
        brush.size = currentSetting.size;
      }

      await brush.setFilter(
        currentSetting?.color ?? "#000000",
        currentSetting?.hardness ?? 1.0,
      );
    }
  } else {
    throw new Error("No brush setting found");
  }
}
