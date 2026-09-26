import { z } from "zod";

export const Proposal = z.object({
	title: z.string(),
	client: z.string(),
	date: z.string(),
	validUntil: z.string(),
	executiveSummary: z.string(),
	problems: z.array(z.object({ title: z.string(), detail: z.string() })),
	scope: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
	options: z.array(
		z.object({ name: z.string(), price: z.string(), description: z.string() }),
	),
	recommendation: z.string(),
	timeline: z.array(
		z.object({ phase: z.string(), duration: z.string(), detail: z.string() }),
	),
	paymentTerms: z.string(),
	terms: z.array(z.string()),
	nextSteps: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

export const LENGTHS = {
	1: "1-page quick quote: one tight paragraph per section, 2-4 scope items total, no fluff.",
	6: "6-page standard proposal: full summary, detailed scope by section, timeline and terms.",
	8: "8-page comparison proposal: at least two priced options, compared, with a reasoned recommendation and break-even thinking.",
	30: "30-page detailed proposal: in-depth problem analysis, methodology, detailed scope per workstream, phased timeline, full commercial terms.",
} as const;
export type Length = keyof typeof LENGTHS;

export type GenerateRequest = {
	model: string;
	notes: string;
	length: Length;
	company: string;
};

export const SYSTEM = `You turn a founder's rough post-call notes into a client-ready business proposal.
Rules:
- Use ONLY prices, timelines and payment terms stated in the notes. Never invent a number. If a price is missing, write "To be confirmed".
- Keep currency and tax wording exactly as written (e.g. "₹2,85,000 + GST").
- The executive summary must stand alone for a decision-maker who reads nothing else.
- Write in plain, confident business English. No hype words.
- If the notes give one price, output one option. If they give several routes, output each as an option.`;

export function buildPrompt(r: GenerateRequest) {
	const today = new Date().toISOString().slice(0, 10);
	return `Prepared by: ${r.company}\nToday: ${today}\nLength: ${LENGTHS[r.length]}\n\nNotes:\n${r.notes}`;
}

// Browser side: the local dev server runs the proposal through your own `claude` login.
export async function generateProposal(r: GenerateRequest): Promise<Proposal> {
	const res = await fetch("/api/generate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(r),
	});
	const data = await res.json() as { error?: string };
	if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
	return Proposal.parse(data);
}
