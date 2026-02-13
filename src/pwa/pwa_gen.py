import os
import datetime
import fnmatch

target_items = ["src", "textures", "index.html", "!*.py", "!demo.js", "!pwa_gen.py"]
output_file = "src/pwa/sw.js"

include_items = [i for i in target_items if not i.startswith("!")]
exclude_patterns = [i[1:] for i in target_items if i.startswith("!")]

cache_version = f"v-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}"
raw_assets = ["/"]
for item in include_items:
    if os.path.exists(item):
        if os.path.isfile(item):
            raw_assets.append(item.replace(os.sep, "/"))
        elif os.path.isdir(item):
            for root, dirs, files in os.walk(item):
                for file in files:
                    full_path = os.path.join(root, file)
                    raw_assets.append(full_path.replace(os.sep, "/"))
    else:
        print(f"Warning: '{item}' not found. Skipping...")

final_assets = []
for asset in raw_assets:
    filename = os.path.basename(asset)
    should_exclude = any(
        fnmatch.fnmatch(filename, pat) or fnmatch.fnmatch(asset, pat)
        for pat in exclude_patterns
    )

    if not should_exclude:
        formatted_path = asset if asset.startswith("/") else f"/{asset}"
        final_assets.append(formatted_path)

final_assets = list(dict.fromkeys(final_assets))
assets_str = ",\n".join([f'  "{a}"' for a in final_assets])
template = f"""const CACHE_NAME = "{cache_version}";
const ASSETS = [
{assets_str}
];

self.addEventListener("install", (event) => {{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
}});

self.addEventListener("activate", (event) => {{
  event.waitUntil(
    caches.keys().then((keys) => {{
      return Promise.all(keys.map((key) => {{
        if (key !== CACHE_NAME) return caches.delete(key);
      }}));
    }})
  );
}});

self.addEventListener("fetch", (event) => {{
  event.respondWith(
    caches.match(event.request).then((res) => res || fetch(event.request))
  );
}});
"""

with open(output_file, "w") as f:
    f.write(template)

print(f"Generated {output_file} with {len(final_assets)} assets")
