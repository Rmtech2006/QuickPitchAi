import { type DependencyList, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { ProposalDoc } from "./ProposalDoc";
import {
	LENGTH_KEYS, LENGTHS, type Length, type Model, MODELS, type Profile, type ProfileInput,
	STATUSES, type Status, type StoredProposal, suggestLength,
} from "./proposal";

// Loads data once, keeps showing the old data while it reloads.
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
	const [data, setData] = useState<T>();
	const [error, setError] = useState("");
	// biome-ignore lint/correctness/useExhaustiveDependencies: caller supplies deps
	const run = useCallback(() => {
		fn().then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
	}, deps);
	useEffect(run, [run]);
	return { data, error, loading: data === undefined && !error, reload: run, setData };
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso: string) {
	const s = (new Date(iso).getTime() - Date.now()) / 1000;
	for (const [unit, secs] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const)
		if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit);
	return "just now";
}

function greeting() {
	const h = new Date().getHours();
	return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function StatusPill({ status }: { status: Status }) {
	return <span className={`pill ${status.toLowerCase()}`}>{status}</span>;
}

function ProposalTable({ items, empty }: { items: StoredProposal[]; empty: React.ReactNode }) {
	if (!items.length) return <div className="empty">{empty}</div>;
	return (
		<table className="list">
			<thead><tr><th>Title</th><th>Client</th><th>Status</th><th>Updated</th></tr></thead>
			<tbody>
				{items.map((p) => (
					<tr key={p.id}>
						<td><a href={`#/proposals/${p.id}`}>{p.proposal.title}</a></td>
						<td>{p.proposal.client}</td>
						<td><StatusPill status={p.status} /></td>
						<td className="muted">{ago(p.updatedAt)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

const firstName = (name: string) => name.split(/\s+/)[0];

export function Dashboard({ profile }: { profile: Profile }) {
	const proposals = useLoad(() => api.proposals(profile.id), [profile.id]);
	const all = proposals.data ?? [];
	const count = (s: Status) => all.filter((p) => p.status === s).length;
	const decided = count("Won") + count("Lost");
	const profileThin = !profile.whatWeDo.trim() || !profile.services.trim();
	const hasProposals = all.length > 0;

	return (
		<div className="page">
			<div className="page-head">
				<div>
					<h1>{greeting()}, {firstName(profile.name)}</h1>
					<p className="muted">{hasProposals ? "Keep good conversations moving with a clear proposal." : "Turn the notes from your last conversation into a proposal."}</p>
				</div>
				<a className="btn" href="#/new">+ New proposal</a>
			</div>

			{profileThin && (
				<a className="notice" href="#/profile">
					<strong>Finish your business profile.</strong> Add what you do and your standard pricing, so every proposal already knows your business.
				</a>
			)}

			{!hasProposals && !proposals.loading && (
				<section className="welcome-panel">
					<div className="welcome-copy">
						<p className="eyebrow">Your next step</p>
						<h2>Start with the conversation.<br />We’ll help shape the proposal.</h2>
						<p className="muted">Paste the rough notes you already have. QuickPitch uses your business profile to organize the scope, pricing and next steps into a client-ready document.</p>
						<a className="btn" href="#/new">Write your first proposal <span aria-hidden="true">→</span></a>
					</div>
					<div className="welcome-note"><span>AFTER THE CALL</span><p>new website<br />need SEO + CMS<br />around ₹2.8L<br />launch in 8 weeks</p><i>messy notes are fine</i></div>
				</section>
			)}

			<div className="stats">
				<Stat label="Drafts" value={count("Draft")} />
				<Stat label="Sent, awaiting reply" value={count("Sent")} />
				<Stat label="Won" value={count("Won")} />
				<Stat label="Win rate" value={decided ? `${Math.round((count("Won") / decided) * 100)}%` : "–"} />
			</div>

			<section className="panel">
				<div className="panel-head">
					<h2>{hasProposals ? "Recent proposals" : "Your proposals"}</h2>
					{all.length > 5 && <a href="#/proposals">View all →</a>}
				</div>
				{proposals.error && <p className="error" role="alert">{proposals.error}</p>}
				{!proposals.loading && (
					<ProposalTable
						items={all.slice(0, 5)}
						empty={<>Your finished proposals and follow-ups will show up here.</>}
					/>
				)}
			</section>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="stat">
			<span className="stat-value">{value}</span>
			<span className="muted">{label}</span>
		</div>
	);
}

export function ProposalsPage({ profile }: { profile: Profile }) {
	const proposals = useLoad(() => api.proposals(profile.id), [profile.id]);
	const [filter, setFilter] = useState<Status | "All">("All");
	const items = (proposals.data ?? []).filter((p) => filter === "All" || p.status === filter);
	return (
		<div className="page">
			<div className="page-head">
				<h1>Proposals</h1>
				<a className="btn" href="#/new">+ New proposal</a>
			</div>
			<div className="tabs" role="group" aria-label="Filter by status">
				{(["All", ...STATUSES] as const).map((s) => (
					<button type="button" key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>{s}</button>
				))}
			</div>
			<section className="panel">
				{proposals.error && <p className="error" role="alert">{proposals.error}</p>}
				{!proposals.loading && <ProposalTable items={items} empty="Nothing here yet." />}
			</section>
		</div>
	);
}

export function ClientsPage({ profile }: { profile: Profile }) {
	const proposals = useLoad(() => api.proposals(profile.id), [profile.id]);
	// Clients come from proposals (newest first), grouped by name.
	const clients = new Map<string, { name: string; items: StoredProposal[] }>();
	for (const p of proposals.data ?? []) {
		const key = p.proposal.client.trim().toLowerCase();
		if (!clients.has(key)) clients.set(key, { name: p.proposal.client, items: [] });
		clients.get(key)?.items.push(p);
	}
	return (
		<div className="page">
			<h1>Clients</h1>
			<section className="panel">
				{proposals.error && <p className="error" role="alert">{proposals.error}</p>}
				{!proposals.loading && (clients.size === 0 ? (
					<div className="empty">Clients appear here once you've written a proposal for them.</div>
				) : (
					<table className="list">
						<thead><tr><th>Client</th><th>Proposals</th><th>Won</th><th>Latest</th><th>Last activity</th></tr></thead>
						<tbody>
							{[...clients.values()].map(({ name, items }) => (
								<tr key={name}>
									<td><a href={`#/proposals/${items[0].id}`}>{name}</a></td>
									<td>{items.length}</td>
									<td>{items.filter((p) => p.status === "Won").length}</td>
									<td><StatusPill status={items[0].status} /></td>
									<td className="muted">{ago(items[0].updatedAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				))}
			</section>
		</div>
	);
}

const STEPS = ["Input details", "Choose format", "Review & generate"];

export function NewProposal({ profile, fromId }: { profile: Profile; fromId?: string }) {
	const [step, setStep] = useState(0);
	const [notes, setNotes] = useState("");
	const [length, setLength] = useState<Length>(1);
	const [model, setModel] = useState<Model>("opus");
	const [error, setError] = useState("");

	// "Regenerate" starts from an existing proposal's notes.
	useEffect(() => {
		if (fromId) api.proposal(fromId).then((p) => setNotes(p.notes), () => {});
	}, [fromId]);

	const suggestion = suggestLength(notes);

	async function generate() {
		setStep(2);
		setError("");
		try {
			const saved = await api.generate({ profileId: profile.id, notes, length, model });
			location.hash = `#/proposals/${saved.id}`;
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setStep(1);
		}
	}

	return (
		<div className="page">
			<ol className="stepper">
				{STEPS.map((s, i) => (
					<li key={s} className={i < step ? "done" : i === step ? "current" : ""}>
						<span>{i < step ? "✓" : i + 1}</span>{s}
					</li>
				))}
			</ol>

			{step === 0 && (
				<section className="panel narrow">
					<h1>Project notes</h1>
					<p className="muted">Just drop your notes from the call. Half-sentences are fine. We already know about {profile.company}.</p>
					<label className="sr-only" htmlFor="notes">Notes from the call</label>
					<textarea
						id="notes"
						rows={14}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder={"loopus - creator ecosystem platform\nproblem: site built on ai builder, invisible to google\nbuild: marketing site (seo, cms), creator portal, brand dashboard\nstarting at 2.85L + gst, payment 40/40/20\n8 weeks: discovery, build portals, qa + launch"}
					/>
					<div className="actions">
						<button
							type="button"
							className="btn"
							disabled={!notes.trim()}
							onClick={() => {
								setLength(suggestion.length);
								setStep(1);
							}}
						>
							Continue →
						</button>
					</div>
				</section>
			)}

			{step === 1 && (
				<div className="format">
					<section>
						<p className="eyebrow">Step 2 of 3</p>
						<h1>Choose proposal length</h1>
						<p className="muted">One set of notes, any length. The format changes what gets written, not what you had to type.</p>
						<div className="lengths" role="radiogroup" aria-label="Proposal length">
							{LENGTH_KEYS.map((n) => (
								<button
									type="button"
									role="radio"
									aria-checked={length === n}
									key={n}
									className="length"
									onClick={() => setLength(n)}
								>
									{suggestion.length === n && <span className="badge">Suggested</span>}
									<strong>{n} page{n === 1 ? "" : "s"}</strong>
									<span className="length-name">{LENGTHS[n].name}</span>
									<small>{LENGTHS[n].blurb}</small>
								</button>
							))}
						</div>
					</section>
					<aside className="panel recommend">
						<h2>Our recommendation</h2>
						<p>{suggestion.length === 8 ? "An" : "A"} {suggestion.length}-page {LENGTHS[suggestion.length].name.toLowerCase()}. {suggestion.why}</p>
						<label>
							Writing model
							<select value={model} onChange={(e) => setModel(e.target.value as Model)}>
								{Object.entries(MODELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
							</select>
						</label>
						{error && <p className="error" role="alert">{error}</p>}
						<div className="actions">
							<button type="button" className="btn ghost" onClick={() => setStep(0)}>Back</button>
							<button type="button" className="btn" onClick={generate}>Generate →</button>
						</div>
						<small className="muted">Runs on your own Claude login. Nothing is sent anywhere else.</small>
					</aside>
				</div>
			)}

			{step === 2 && (
				<section className="panel narrow generating" aria-live="polite">
					<div className="spinner" aria-hidden="true" />
					<h1>Writing your proposal…</h1>
					<p className="muted">Usually 20–60 seconds. Longer proposals take a few minutes.</p>
				</section>
			)}
		</div>
	);
}

export function ProposalPage({ id, profile }: { id: string; profile: Profile }) {
	const item = useLoad(() => api.proposal(id), [id]);
	const p = item.data;
	if (item.error || (p && p.profileId !== profile.id))
		return <div className="page"><p className="error">Proposal not found.</p></div>;
	if (!p) return null;

	async function setStatus(status: Status) {
		item.setData(await api.setStatus(id, status));
	}

	return (
		<div className="page">
			<div className="toolbar no-print">
				<a href="#/proposals">← Proposals</a>
				<label className="row">
					Status
					<select value={p.status} onChange={(e) => setStatus(e.target.value as Status)}>
						{STATUSES.map((s) => <option key={s}>{s}</option>)}
					</select>
				</label>
				<a className="btn ghost" href={`#/new/${p.id}`}>Regenerate</a>
				<button type="button" className="btn" onClick={() => window.print()}>Save as PDF</button>
			</div>
			<ProposalDoc p={p.proposal} company={profile.company} />
		</div>
	);
}

const EMPTY: ProfileInput = {
	name: "", company: "", whatWeDo: "", services: "", idealClients: "", tone: "", defaultTerms: "", accent: "#f26b1d",
};

const FIELDS: { key: keyof ProfileInput; label: string; hint?: string; placeholder: string; long?: boolean }[] = [
	{ key: "name", label: "Your name", placeholder: "Ritish Maheshwari" },
	{ key: "company", label: "Company", placeholder: "Blyft" },
	{ key: "whatWeDo", label: "What your business does", long: true, placeholder: "Growth consultancy for D2C brands and startups: websites, apps, performance marketing and content." },
	{ key: "services", label: "Services and standard pricing", hint: "Used only when your call notes don't give a price.", long: true, placeholder: "Website (Next.js, SEO, CMS): from ₹1.5L + GST\nSocial media retainer: ₹45,000/month\nMeta + Google ads management: 15% of ad spend, min ₹25,000/month" },
	{ key: "idealClients", label: "Who you work with", placeholder: "Founders of D2C brands, restaurants and early-stage startups in India" },
	{ key: "tone", label: "How your proposals should sound", placeholder: "Direct and confident, short sentences, no jargon" },
	{ key: "defaultTerms", label: "Standard terms", long: true, placeholder: "50% advance, 50% on delivery. Quote valid 15 days. Two revision rounds included. GST extra." },
];

export function ProfileForm({ initial, submitLabel, onSave, onCancel }: {
	initial?: ProfileInput;
	submitLabel: string;
	onSave: (p: ProfileInput) => Promise<void>;
	onCancel?: () => void;
}) {
	const [form, setForm] = useState<ProfileInput>(() => ({ ...EMPTY, ...initial }));
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
	const set = (k: keyof ProfileInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setMsg(undefined);
		try {
			await onSave(form);
			setMsg({ ok: true, text: "Saved." });
		} catch (err) {
			setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="form" onSubmit={submit}>
			{FIELDS.map((f) => (
				<label key={f.key}>
					{f.label}
					{f.hint && <small className="muted">{f.hint}</small>}
					{f.long ? (
						<textarea rows={4} value={form[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
					) : (
						<input value={form[f.key]} placeholder={f.placeholder} required={f.key === "name" || f.key === "company"} onChange={(e) => set(f.key, e.target.value)} />
					)}
				</label>
			))}
			<label className="row">
				Brand colour
				<input type="color" value={form.accent} onChange={(e) => set("accent", e.target.value)} />
			</label>
			{msg && <p className={msg.ok ? "ok" : "error"} role="status">{msg.text}</p>}
			<div className="actions">
				{onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
				<button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
			</div>
		</form>
	);
}
