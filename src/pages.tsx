import { useEffect, useRef, useState } from "react";
import { ClientFields } from "./clients";
import { LogoPicker, ProposalTable, useLoad, withFoundLogo } from "./ui";
import { api } from "./api";
import { ProposalDoc } from "./ProposalDoc";
import {
	type ClientInput, LENGTH_KEYS, LENGTHS, type Length, type Model, MODELS, type Profile, type ProfileInput,
	STATUSES, type Status, AVAILABLE_LENGTHS, SITE_URL,
} from "./proposal";

function greeting() {
	const h = new Date().getHours();
	return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
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

const STEPS = ["Input details", "Choose format", "Review & generate"];

const NEW_CLIENT = "new";

export function NewProposal({ profile, fromId, clientId: startClient }: { profile: Profile; fromId?: string; clientId?: string }) {
	const [step, setStep] = useState(0);
	const [notes, setNotes] = useState("");
	const clients = useLoad(() => api.clients(profile.id), [profile.id]);
	const [clientId, setClientId] = useState(startClient ?? "");
	const [newClient, setNewClient] = useState<ClientInput>({ name: "" });
	const [saving, setSaving] = useState(false);
	const [productImage, setProductImage] = useState(false);
	const [length, setLength] = useState<Length>(1);
	const [model, setModel] = useState<Model>("opus");
	const [error, setError] = useState("");

	// "Regenerate" starts from an existing proposal's notes.
	useEffect(() => {
		if (fromId)
			api.proposal(fromId).then((p) => {
				setNotes(p.notes);
				if (p.clientId) setClientId(p.clientId);
			}, () => {});
	}, [fromId]);

	// No saved clients yet: go straight to adding one.
	const hasClients = (clients.data?.length ?? 0) > 0;
	const picked = clientId || (clients.data && !hasClients ? NEW_CLIENT : "");
	const selected = clients.data?.find((c) => c.id === picked);
	const canContinue = notes.trim() && (picked === NEW_CLIENT ? newClient.name.trim() : picked);


	async function toStep2() {
		setError("");
		if (picked === NEW_CLIENT) {
			setSaving(true);
			try {
				const c = await api.createClient(profile.id, await withFoundLogo(newClient));
				clients.setData([...(clients.data ?? []), c]);
				setClientId(c.id);
			} catch (e) {
				setSaving(false);
				return setError(e instanceof Error ? e.message : String(e));
			}
			setSaving(false);
		}
		setLength(1);
		setStep(1);
	}

	async function generate() {
		setStep(2);
		setError("");
		try {
			const saved = await api.generate({ profileId: profile.id, clientId: clientId || undefined, notes, length, model, productImage });
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
					<h1>Client & notes</h1>
					<p className="muted">We design the proposal in your client's brand from their website: logo, colours, fonts and products. We already know about {profile.company}.</p>
					<label className="field">
						Client
						<select value={picked} onChange={(e) => setClientId(e.target.value)}>
							{hasClients && <option value="">Choose a client…</option>}
							{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.website ? ` · ${c.website}` : ""}</option>)}
							<option value={NEW_CLIENT}>+ New client</option>
						</select>
					</label>
					{selected && !selected.website && (
						<p className="muted small">{selected.name} has no website saved, so the design won't match their brand. <a href={`#/clients/${selected.id}`}>Add it</a>.</p>
					)}
					{picked === NEW_CLIENT && (
						<div className="inset">
							<ClientFields value={newClient} onChange={setNewClient} />
						</div>
					)}
					<label htmlFor="notes" className="field">Notes from the call <small className="muted">Half-sentences are fine.</small></label>
					<textarea
						id="notes"
						rows={14}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder={"loopus - creator ecosystem platform\nproblem: site built on ai builder, invisible to google\nbuild: marketing site (seo, cms), creator portal, brand dashboard\nstarting at 2.85L + gst, payment 40/40/20\n8 weeks: discovery, build portals, qa + launch"}
					/>
					{error && <p className="error" role="alert">{error}</p>}
					<div className="actions">
						<button
							type="button"
							className="btn"
							disabled={!canContinue || saving}
							onClick={toStep2}
						>
							{saving ? "Saving client…" : "Continue →"}
						</button>
					</div>
				</section>
			)}

			{step === 1 && (
				<div className="format">
					<section>
						<p className="eyebrow">Step 2 of 3</p>
						<h1>Choose proposal length</h1>
						<p className="muted">Start with a one-page sales proposal, designed in your client's brand. Longer formats are on the way.</p>
						<div className="lengths" role="radiogroup" aria-label="Proposal length">
							{LENGTH_KEYS.map((n) => (
								<button
									type="button"
									role="radio"
									aria-checked={length === n}
									aria-disabled={!AVAILABLE_LENGTHS.includes(n)}
									disabled={!AVAILABLE_LENGTHS.includes(n)}
									key={n}
									className="length"
									onClick={() => setLength(n)}
								>
									{AVAILABLE_LENGTHS.includes(n) ? <span className="badge">Available now</span> : <span className="badge soon">Coming soon</span>}
									<strong>{n} page{n === 1 ? "" : "s"}</strong>
									<span className="length-name">{LENGTHS[n].name}</span>
									<small>{LENGTHS[n].blurb}</small>
								</button>
							))}
						</div>
						<p className="muted small">
							6, 8 and 30-page proposals are coming soon. Follow updates at{" "}
							<a href={SITE_URL} target="_blank" rel="noreferrer">quickpitchai.vercel.app</a>.
						</p>
					</section>
					<aside className="panel recommend">
						<h2>One-page sales proposal</h2>
						<p>We read your client's website, match their logo, colours and fonts, and write a single A4 page with the problem, what you'll do, the price and the next step.</p>
						<label>
							Writing model
							<select value={model} onChange={(e) => setModel(e.target.value as Model)}>
								{Object.entries(MODELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
							</select>
						</label>
						<label className="row check">
							<input type="checkbox" checked={productImage} onChange={(e) => setProductImage(e.target.checked)} />
							<span>Use a product photo from their website <small className="muted block">Off by default. Best for product brands.</small></span>
						</label>
						{error && <p className="error" role="alert">{error}</p>}
						<div className="actions">
							<button type="button" className="btn ghost" onClick={() => setStep(0)}>Back</button>
							<button type="button" className="btn" onClick={generate}>Generate →</button>
						</div>
						<small className="muted">Runs on your own Claude login. Claude reads the client's website to match their brand.</small>
					</aside>
				</div>
			)}

			{step === 2 && (
				<section className="panel narrow generating" aria-live="polite">
					<div className="spinner" aria-hidden="true" />
					<h1>Designing your proposal…</h1>
					<p className="muted">
						{clients.data?.find((c) => c.id === clientId)?.website ? "Reading the client's website, picking up their brand, then writing and designing. " : "Writing and designing. "}
						Usually 1–4 minutes for one page, longer for more pages.
					</p>
				</section>
			)}
		</div>
	);
}

// Safety net for designs that run long: lay the page out taller, then zoom it back to exactly A4,
// so nothing is cut off on screen or in the PDF.
function fitPages(doc: Document) {
	for (const page of doc.querySelectorAll<HTMLElement>(".page")) {
		page.style.zoom = "";
		page.style.width = "";
		page.style.height = "";
		const over = page.scrollHeight / page.clientHeight;
		if (!(over > 1.005)) continue;
		const z = 1 / over;
		page.style.zoom = String(z);
		page.style.width = `calc(210mm / ${z})`;
		page.style.height = `calc(297mm / ${z})`;
	}
}

export function ProposalPage({ id, profile }: { id: string; profile: Profile }) {
	const item = useLoad(() => api.proposal(id), [id]);
	const frame = useRef<HTMLIFrameElement>(null);
	// Grow the frame to the page's full height, so the proposal scrolls with the app.
	const fitFrame = () => {
		const doc = frame.current?.contentDocument;
		if (!doc || !frame.current) return;
		fitPages(doc);
		frame.current.style.height = `${doc.documentElement.scrollHeight}px`;
		// Web fonts can change text height after load: fit again once they're in.
		doc.fonts?.ready.then(() => {
			fitPages(doc);
			if (frame.current) frame.current.style.height = `${doc.documentElement.scrollHeight}px`;
		});
	};
	const printFrame = () => frame.current?.contentWindow?.print();
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
				<button type="button" className="btn" onClick={() => (p.html ? printFrame() : window.print())}>Save as PDF</button>
			</div>
			{p.html ? (
				<iframe
					ref={frame}
					aria-label={p.title}
					className="designed"
					srcDoc={p.html}
					// No allow-scripts: the page comes from web research, so it may never run code.
					sandbox="allow-same-origin allow-modals"
					onLoad={fitFrame}
				/>
			) : (
				p.proposal && (
					<div style={{ "--accent": profile.accent } as React.CSSProperties}>
						<ProposalDoc p={p.proposal} company={profile.company} />
					</div>
				)
			)}
		</div>
	);
}

const EMPTY: ProfileInput = {
	name: "", company: "", website: "", email: "", phone: "", logo: "",
	whatWeDo: "", services: "", idealClients: "", tone: "", defaultTerms: "", accent: "#f26b1d",
};

type Field = { key: keyof ProfileInput; label: string; hint?: string; placeholder: string; long?: boolean; type?: string; required?: boolean };

const SECTIONS: { title: string; hint: string; fields: Field[] }[] = [
	{
		title: "Brand",
		hint: "Your logo and website appear on every proposal.",
		fields: [
			{ key: "company", label: "Company", placeholder: "BLYFT Technologies", required: true },
			{ key: "website", label: "Website", placeholder: "www.blyftit.com", type: "url" },
		],
	},
	{
		title: "Contact",
		hint: "Shown in the footer of your proposals.",
		fields: [
			{ key: "name", label: "Your name", placeholder: "Ritish Maheshwari", required: true },
			{ key: "email", label: "Email", placeholder: "contact@blyftit.com", type: "email" },
			{ key: "phone", label: "Phone", placeholder: "+91 98765 43210", type: "tel" },
		],
	},
	{
		title: "About your business",
		hint: "So every proposal already knows what you do and what you charge.",
		fields: [
			{ key: "whatWeDo", label: "What your business does", long: true, placeholder: "Growth consultancy for D2C brands and startups: websites, apps, performance marketing and content." },
			{ key: "services", label: "Services and standard pricing", hint: "Used only when your call notes don't give a price.", long: true, placeholder: "Website (Next.js, SEO, CMS): from ₹1.5L + GST\nSocial media retainer: ₹45,000/month\nMeta + Google ads management: 15% of ad spend, min ₹25,000/month" },
			{ key: "idealClients", label: "Who you work with", placeholder: "Founders of D2C brands, restaurants and early-stage startups in India" },
			{ key: "tone", label: "How your proposals should sound", placeholder: "Direct and confident, short sentences, no jargon" },
			{ key: "defaultTerms", label: "Standard terms", long: true, placeholder: "50% advance, 50% on delivery. Quote valid 15 days. Two revision rounds included. GST extra." },
		],
	},
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
			{SECTIONS.map((sec) => (
				<fieldset key={sec.title} className="form-section">
					<legend>{sec.title}</legend>
					<p className="muted small">{sec.hint}</p>
					{sec.title === "Brand" && (
						<>
							<LogoPicker value={form.logo ?? ""} tone={form.logoTone ?? "dark"} website={form.website} onChange={(logo, tone) => setForm((f) => ({ ...f, logo, logoTone: tone }))} />
							<label className="row">
								Brand colour
								<input type="color" value={form.accent} onChange={(e) => set("accent", e.target.value)} />
							</label>
						</>
					)}
					{sec.fields.map((f) => (
						<label key={f.key}>
							{f.label}
							{f.hint && <small className="muted">{f.hint}</small>}
							{f.long ? (
								<textarea rows={4} value={form[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
							) : (
								<input
									type={f.type === "url" ? "text" : (f.type ?? "text")}
									inputMode={f.type === "url" ? "url" : undefined}
									value={form[f.key] ?? ""}
									placeholder={f.placeholder}
									required={f.required}
									onChange={(e) => set(f.key, e.target.value)}
								/>
							)}
						</label>
					))}
				</fieldset>
			))}
			{msg && <p className={msg.ok ? "ok" : "error"} role="status">{msg.text}</p>}
			<div className="actions">
				{onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
				<button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
			</div>
		</form>
	);
}
