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
	website: z.string().max(300).default(""),
	email: z.string().max(200).default(""),
	phone: z.string().max(50).default(""),
	// Uploaded brand logo as a data URL (images only, ~1 MB max).
	logo: z
		.string()
		.max(1_400_000)
		.regex(/^(data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+)?$/i)
		.default(""),
	logoTone: z.enum(["light", "dark"]).default("dark"),
});
export type ProfileInput = z.input<typeof ProfileInput>;
export type Profile = z.output<typeof ProfileInput> & { id: string; createdAt: string };

export const ClientInput = z.object({
	name: z.string().min(1).max(200),
	website: z.string().max(300).default(""),
	contactName: z.string().max(200).default(""),
	email: z.string().max(200).default(""),
	phone: z.string().max(50).default(""),
	notes: z.string().max(3000).default(""),
});
export type ClientInput = z.input<typeof ClientInput>;
export type Client = z.output<typeof ClientInput> & { id: string; profileId: string; createdAt: string };

export const STATUSES = ["Draft", "Sent", "Won", "Lost"] as const;
export type Status = (typeof STATUSES)[number];

export type StoredProposal = {
	id: string;
	profileId: string;
	notes: string;
	length: Length;
	clientId?: string;
	clientUrl?: string;
	title: string;
	client: string;
	// New proposals are a designed HTML page in the client's brand.
	html?: string;
	// Older proposals were structured text rendered by ProposalDoc.
	proposal?: Proposal;
	status: Status;
	createdAt: string;
	updatedAt: string;
};

export const LENGTHS = {
	1: {
		name: "Sales proposal",
		blurb: "A designed one-pager in your client's brand, ready to send.",
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

// Only the one-page sales proposal is live; longer formats show as "Coming soon".
export const AVAILABLE_LENGTHS: readonly Length[] = [1];
export const SITE_URL = "https://quickpitchai.vercel.app";

// What Claude returns for a designed proposal.
export const DesignedProposal = z.object({
	title: z.string(),
	client: z.string(),
	html: z.string(),
});
export type DesignedProposal = z.infer<typeof DesignedProposal>;

export const MODELS = { opus: "Opus (best writing)", sonnet: "Sonnet (faster)" } as const;
export type Model = keyof typeof MODELS;
