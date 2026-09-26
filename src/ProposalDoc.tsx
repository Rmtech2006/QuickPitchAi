import type { Proposal } from "./proposal";

export function ProposalDoc({ p, company }: { p: Proposal; company: string }) {
	return (
		<article className="doc">
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
