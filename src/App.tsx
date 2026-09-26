import { useState } from "react";
import { generateProposal, type Length, type Proposal } from "./proposal";

const MODELS = {
	opus: "Opus (best)",
	sonnet: "Sonnet (faster, uses less of your plan)",
};

// Per-browser settings.
function load(key: string, fallback: string) {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
}
function save(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {}
}
function useSetting(key: string, fallback: string) {
	const [value, setValue] = useState(() => load(key, fallback));
	return [value, (v: string) => (setValue(v), save(key, v))] as const;
}

export default function App() {
	const [model, setModel] = useSetting("qp.model", "opus");
	const [company, setCompany] = useSetting("qp.company", "");
	const [accent, setAccent] = useSetting("qp.accent", "#e8590c");
	const [notes, setNotes] = useState("");
	const [length, setLength] = useState<Length>(1);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [proposal, setProposal] = useState<Proposal | null>(null);

	async function generate() {
		setBusy(true);
		setError("");
		try {
			setProposal(await generateProposal({ model, notes, length, company }));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="app" style={{ "--accent": accent } as React.CSSProperties}>
			<aside className="panel no-print">
				<h1>QuickPitch</h1>

				<details>
					<label>
						Model
						<select value={model} onChange={(e) => setModel(e.target.value)}>
							{Object.entries(MODELS).map(([id, name]) => (
								<option key={id} value={id}>{name}</option>
							))}
						</select>
					</label>
					<label>
						Your company
						<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Blyft" />
					</label>
					<label className="row">
						Brand colour
						<input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
					</label>
				</details>

				<label>
					Notes from the call
					<textarea
						rows={12}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder={"loopus - creator platform\nproblem: site invisible to google\nbuild: marketing site, creator portal\nstarting at 2.85L + gst, payment 40/40/20\n8 weeks"}
					/>
				</label>

				<fieldset>
					<legend>Length</legend>
					{([1, 6, 8, 30] as const).map((n) => (
						<label key={n} className="row">
							<input type="radio" checked={length === n} onChange={() => setLength(n)} />
							{n} page{n === 1 ? "" : "s"}
						</label>
					))}
				</fieldset>

				<button type="button" onClick={generate} disabled={busy || !notes.trim()}>
					{busy ? "Writing… (can take a minute)" : "Generate proposal"}
				</button>
				{error && <p className="error" role="alert">{error}</p>}
				{proposal && (
					<button type="button" className="secondary" onClick={() => window.print()}>
						Save as PDF
					</button>
				)}
			</aside>

			<main className="doc">
				{proposal ? <ProposalView p={proposal} company={company} /> : (
					<p className="empty no-print">Your proposal appears here.</p>
				)}
			</main>
		</div>
	);
}

function ProposalView({ p, company }: { p: Proposal; company: string }) {
	return (
		<article>
			<header>
				<p className="eyebrow">{company} × {p.client}</p>
				<h1>{p.title}</h1>
				<p className="meta">{p.date} · Valid until {p.validUntil}</p>
			</header>

			<section>
				<h2>Summary</h2>
				<p>{p.executiveSummary}</p>
			</section>

			{p.problems.length > 0 && (
				<section>
					<h2>Where things stand</h2>
					<div className="grid">
						{p.problems.map((x) => (
							<div key={x.title} className="card"><h3>{x.title}</h3><p>{x.detail}</p></div>
						))}
					</div>
				</section>
			)}

			<section>
				<h2>Scope</h2>
				{p.scope.map((s) => (
					<div key={s.title}>
						<h3>{s.title}</h3>
						<ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
					</div>
				))}
			</section>

			<section>
				<h2>Investment</h2>
				<div className="grid">
					{p.options.map((o) => (
						<div key={o.name} className="card price">
							<h3>{o.name}</h3>
							<p className="amount">{o.price}</p>
							<p>{o.description}</p>
						</div>
					))}
				</div>
				{p.options.length > 1 && <p><strong>Recommendation:</strong> {p.recommendation}</p>}
				<p><strong>Payment:</strong> {p.paymentTerms}</p>
			</section>

			{p.timeline.length > 0 && (
				<section>
					<h2>Timeline</h2>
					<table>
						<tbody>
							{p.timeline.map((t) => (
								<tr key={t.phase}><th>{t.phase}</th><td>{t.duration}</td><td>{t.detail}</td></tr>
							))}
						</tbody>
					</table>
				</section>
			)}

			<section>
				<h2>Terms</h2>
				<ul>{p.terms.map((t) => <li key={t}>{t}</li>)}</ul>
			</section>

			<footer><strong>Next step:</strong> {p.nextSteps}</footer>
		</article>
	);
}
