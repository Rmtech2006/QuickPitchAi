import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

const SYSTEM = `You turn a founder's rough post-call notes into a client-ready business proposal.
Rules:
- Use ONLY prices, timelines and payment terms stated in the notes. Never invent a number. If a price is missing, write "To be confirmed".
- Keep currency and tax wording exactly as written (e.g. "₹2,85,000 + GST").
- The executive summary must stand alone for a decision-maker who reads nothing else.
- Write in plain, confident business English. No hype words.
- If the notes give one price, output one option. If they give several routes, output each as an option.`;

export async function generateProposal(opts: {
	apiKey: string;
	model: string;
	notes: string;
	length: Length;
	company: string;
}): Promise<Proposal> {
	// Key goes straight from the user's browser to Anthropic; it never touches our server.
	const client = new Anthropic({
		apiKey: opts.apiKey,
		dangerouslyAllowBrowser: true,
	});
	const today = new Date().toISOString().slice(0, 10);
	const stream = client.messages.stream({
		model: opts.model,
		max_tokens: 64000,
		system: SYSTEM,
		messages: [
			{
				role: "user",
				content: `Prepared by: ${opts.company}\nToday: ${today}\nLength: ${LENGTHS[opts.length]}\n\nNotes:\n${opts.notes}`,
			},
		],
		output_config: { format: zodOutputFormat(Proposal) },
	});
	const msg = await stream.finalMessage();
	if (msg.stop_reason === "refusal")
		throw new Error("The model declined these notes. Try rewording them.");
	if (msg.stop_reason === "max_tokens")
		throw new Error("Output was cut off. Try a shorter length.");
	if (!msg.parsed_output) throw new Error("Could not read the model's output.");
	return msg.parsed_output;
}
