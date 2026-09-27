// Reads a meeting transcript file in the browser and returns plain text.
// Handles PDF (e.g. Google Meet / Gemini notes), Word .docx, subtitle files (.vtt, .srt from Zoom,
// Teams or Meet) and plain text. Nothing is uploaded anywhere: the text goes to your own Claude.

export const TRANSCRIPT_ACCEPT = ".pdf,.docx,.vtt,.srt,.txt,.md";
export const MAX_TRANSCRIPT_BYTES = 20_000_000;

export type Transcript = { name: string; text: string; words: number };

async function pdfText(file: File): Promise<string> {
	const pdfjs = await import("pdfjs-dist");
	pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
	const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
	const pages: string[] = [];
	for (let n = 1; n <= pdf.numPages; n++) {
		const content = await (await pdf.getPage(n)).getTextContent();
		pages.push(content.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : "")).join(""));
	}
	return pages.join("\n\n");
}

// A .docx is a zip: find word/document.xml in the central directory and inflate it.
async function docxText(file: File): Promise<string> {
	const buf = new Uint8Array(await file.arrayBuffer());
	const view = new DataView(buf.buffer);
	let eocd = buf.length - 22;
	while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
	if (eocd < 0) throw new Error("That Word file looks damaged.");
	let at = view.getUint32(eocd + 16, true);
	const count = view.getUint16(eocd + 10, true);
	for (let e = 0; e < count; e++) {
		const method = view.getUint16(at + 10, true);
		const size = view.getUint32(at + 20, true);
		const nameLen = view.getUint16(at + 28, true);
		const extraLen = view.getUint16(at + 30, true);
		const commentLen = view.getUint16(at + 32, true);
		const local = view.getUint32(at + 42, true);
		const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
		if (name === "word/document.xml") {
			const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
			const data = buf.subarray(start, start + size);
			const xml =
				method === 0
					? new TextDecoder().decode(data)
					: await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
			return xml
				.replace(/<w:tab\/>/g, "\t")
				.replace(/<\/w:p>/g, "\n")
				.replace(/<[^>]+>/g, "")
				.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
		}
		at += 46 + nameLen + extraLen + commentLen;
	}
	throw new Error("Couldn't find the text in that Word file.");
}

// Drop cue numbers and timings; keep "Speaker: words".
function subtitleText(raw: string): string {
	return raw
		.split(/\r?\n/)
		.filter((l) => l.trim() && !/-->/.test(l) && !/^\d+$/.test(l.trim()) && !/^WEBVTT/.test(l) && !/^(NOTE|STYLE)\b/.test(l))
		.map((l) => l.replace(/<v\s+([^>]+)>/g, "$1: ").replace(/<[^>]+>/g, "").trim())
		.join("\n");
}

export async function readTranscript(file: File): Promise<Transcript> {
	if (file.size > MAX_TRANSCRIPT_BYTES) throw new Error("That file is too large. Transcripts must be under 20 MB.");
	const ext = file.name.toLowerCase().split(".").pop() ?? "";
	let text: string;
	if (ext === "pdf") text = await pdfText(file);
	else if (ext === "docx") text = await docxText(file);
	else if (ext === "vtt" || ext === "srt") text = subtitleText(await file.text());
	else if (ext === "txt" || ext === "md") text = await file.text();
	else throw new Error("Use a PDF, Word (.docx), subtitle (.vtt, .srt) or text file.");
	text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	if (text.length < 200) throw new Error("There's almost no text in that file. If it's a scanned PDF, export the transcript as text instead.");
	return { name: file.name, text, words: text.split(/\s+/).length };
}
