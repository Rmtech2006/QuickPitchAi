// Cleans up a logo in the browser before it's saved:
// - removes a solid background (e.g. a white wordmark on a black 1200x630 share image),
// - trims empty padding,
// - reports whether what's left is light or dark, so the proposal can put it on a contrasting chip.

export type Tone = "light" | "dark";

function load(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Could not read that image."));
		img.src = src;
	});
}

export async function processLogo(dataUrl: string): Promise<{ dataUrl: string; tone: Tone }> {
	const img = await load(dataUrl);
	// Rasterise at a print-friendly size: longest side 800px (SVGs often report tiny sizes).
	const w0 = img.naturalWidth || 300;
	const h0 = img.naturalHeight || 150;
	const scale = 800 / Math.max(w0, h0);
	const w = Math.max(1, Math.round(w0 * scale));
	const h = Math.max(1, Math.round(h0 * scale));
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return { dataUrl, tone: "dark" };
	ctx.drawImage(img, 0, 0, w, h);
	const image = ctx.getImageData(0, 0, w, h);
	const px = image.data;

	// A solid background = all four corners opaque and the same colour.
	const at = (x: number, y: number) => (y * w + x) * 4;
	const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
	const bg = [px[corners[0]], px[corners[0] + 1], px[corners[0] + 2]];
	const solid = corners.every(
		(i) => px[i + 3] > 250 && Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < 30,
	);

	if (solid) {
		// "Colour to alpha": undo compositing over the background, so anti-aliased edges stay smooth.
		for (let i = 0; i < px.length; i += 4) {
			let a = 0;
			for (let c = 0; c < 3; c++) {
				const v = px[i + c];
				const b = bg[c];
				const ac = v > b ? (v - b) / (255 - b || 1) : v < b ? (b - v) / (b || 1) : 0;
				if (ac > a) a = ac;
			}
			if (a < 0.04) {
				px[i + 3] = 0;
				continue;
			}
			for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, Math.round((px[i + c] - bg[c]) / a + bg[c])));
			px[i + 3] = Math.round(px[i + 3] * a);
		}
	}

	// Trim to the visible content, plus a little breathing room.
	let minX = w, minY = h, maxX = -1, maxY = -1, lum = 0, weight = 0;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = at(x, y);
			const a = px[i + 3];
			if (a <= 24) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
			lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) * a;
			weight += a;
		}
	if (maxX < 0) return { dataUrl, tone: "dark" };
	const tone: Tone = lum / weight > 160 ? "light" : "dark";
	// Nothing to remove or trim: keep the original (an SVG stays sharp at any size).
	const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
	const cropped = minX > pad || minY > pad || maxX < w - 1 - pad || maxY < h - 1 - pad;
	if (!solid && !cropped) return { dataUrl, tone };

	ctx.putImageData(image, 0, 0);
	const x0 = Math.max(0, minX - pad);
	const y0 = Math.max(0, minY - pad);
	const cw = Math.min(w, maxX + pad + 1) - x0;
	const ch = Math.min(h, maxY + pad + 1) - y0;
	const out = document.createElement("canvas");
	out.width = cw;
	out.height = ch;
	out.getContext("2d")?.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
	return { dataUrl: out.toDataURL("image/png"), tone };
}
