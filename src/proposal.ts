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

// What each account tells us once, so every proposal already knows the business.
export const ProfileInput = z.object({
	name: z.string().min(1).max(100),
	company: z.string().min(1).max(200),
	whatWeDo: z.string().max(3000),
	services: z.string().max(5000),
	idealClients: z.string().max(2000),
	tone: z.string().max(500),
	defaultTerms: z.string().max(3000),
	accent: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type ProfileInput = z.infer<typeof ProfileInput>;
export type Profile = ProfileInput & { id: string; createdAt: string };

export const STATUSES = ["Draft", "Sent", "Won", "Lost"] as const;
export type Status = (typeof STATUSES)[number];

export type StoredProposal = {
	id: string;
	profileId: string;
	notes: string;
	length: Length;
	proposal: Proposal;
	status: Status;
	createdAt: string;
	updatedAt: string;
};

export const LENGTHS = {
	1: {
		name: "Quick quote",
		blurb: "Key details on one page. Good for quick, smaller deals.",
		prompt: "1-page quick quote: one tight paragraph per section, 2-4 scope items total, no fluff.",
	},
	6: {
		name: "Standard proposal",
		blurb: "Summary, scope, pricing, timeline and terms.",
		prompt: "6-page standard proposal: full summary, detailed scope by section, timeline and terms.",
	},
	8: {
		name: "Comparison proposal",
		blurb: "Two or more options, compared, with a recommendation.",
		prompt: "8-page comparison proposal: at least two priced options, compared, with a reasoned recommendation and break-even thinking.",
	},
	30: {
		name: "Detailed proposal",
		blurb: "In-depth research, methodology and full commercial detail.",
		prompt: "30-page detailed proposal: in-depth problem analysis, methodology, detailed scope per workstream, phased timeline, full commercial terms.",
	},
} as const;
export type Length = keyof typeof LENGTHS;
export const LENGTH_KEYS = [1, 6, 8, 30] as const;

// ponytail: keyword/size heuristic, swap for a cheap model call if suggestions feel off.
export function suggestLength(notes: string): { length: Length; why: string } {
	const prices = notes.match(/(₹|rs\.?|inr|\$)\s?[\d,.]+|[\d.]+\s?(l|lakh|lakhs|k|cr)\b/gi) ?? [];
	if (/\b(option|vs|versus|or)\b/i.test(notes) && prices.length >= 2)
		return { length: 8, why: "Your notes mention more than one priced route, so a side-by-side comparison with a recommendation fits best." };
	if (notes.length > 1500)
		return { length: 6, why: "Your notes cover a lot of scope, so a standard proposal gives each part room." };
	return { length: 1, why: "Your notes describe one clear offer, so a single page keeps it focused and quick to approve." };
}

export const MODELS = { opus: "Opus (best writing)", sonnet: "Sonnet (faster)" } as const;
export type Model = keyof typeof MODELS;

export const SYSTEM = `You turn a founder's rough post-call notes into a client-ready business proposal, written as the business described in the profile.
Rules:
- Prices, timelines and payment terms come from the notes first. If the notes have none, you may use the business profile's standard pricing or terms only where they clearly apply. Otherwise write "To be confirmed". Never invent a number.
- Keep currency and tax wording exactly as written (e.g. "₹2,85,000 + GST").
- Use the profile to describe the business's capabilities and to match its tone. Never claim anything the profile or notes don't support.
- The executive summary must stand alone for a decision-maker who reads nothing else.
- Write in plain, confident business English. No hype words.
- If the notes give one price, output one option. If they give several routes, output each as an option.`;

export function buildPrompt(p: ProfileInput, notes: string, length: Length) {
	const today = new Date().toISOString().slice(0, 10);
	return `<business_profile>
Company: ${p.company}
What we do: ${p.whatWeDo}
Services and standard pricing: ${p.services}
Ideal clients: ${p.idealClients}
Tone: ${p.tone}
Standard terms: ${p.defaultTerms}
</business_profile>

Today: ${today}
Length: ${LENGTHS[length].prompt}

<call_notes>
${notes}
</call_notes>`;
}
