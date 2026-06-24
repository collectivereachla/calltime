// Pull the dominant, vibrant color out of an image, in-browser (client only).
// Skips neutrals (grays) and near black/white; weights by saturation so the
// brand color wins over a large white/black background. Used for org logos and
// per-show flyers/posters to seed playbill brand color.
export function extractDominantColor(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = 64;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable."));
      ctx.drawImage(img, 0, 0, size, size);
      let data: Uint8ClampedArray;
      try { data = ctx.getImageData(0, 0, size, size).data; }
      catch { return reject(new Error("Couldn't read the image's pixels.")); }
      const bins = new Map<string, { score: number; r: number; g: number; b: number; n: number }>();
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = (r + g + b) / 3;
        if (sat < 0.30) continue;
        if (lum < 60 || lum > 235) continue; // skip muddy darks + near-white
        const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
        const prev = bins.get(key) || { score: 0, r: 0, g: 0, b: 0, n: 0 };
        prev.score += sat * (lum / 255); prev.r += r; prev.g += g; prev.b += b; prev.n++;
        bins.set(key, prev);
      }
      if (bins.size === 0) return reject(new Error("No strong color found in the image."));
      let best: { score: number; r: number; g: number; b: number; n: number } | null = null;
      for (const v of bins.values()) if (!best || v.score > best.score) best = v;
      const r = Math.round(best!.r / best!.n), g = Math.round(best!.g / best!.n), b = Math.round(best!.b / best!.n);
      const hex = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
      resolve(hex.toUpperCase());
    };
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = url;
  });
}
