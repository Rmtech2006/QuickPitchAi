import { useEffect, useState, type FormEvent, type ReactNode } from "react";

// Public site for the hosted build: homepage, contact form and policy pages.

const REPO = "https://github.com/Rmtech2006/QuickPitchAi";
const EMAIL = "hello@blyftit.com";
const COMPANY = "BLYFT Technologies";
const UPDATED = "27 September 2026";

export function useHashRoute() {
	const [hash, setHash] = useState(location.hash);
	useEffect(() => {
		const on = () => setHash(location.hash);
		addEventListener("hashchange", on);
		return () => removeEventListener("hashchange", on);
	}, []);
	return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

export function Logo() {
	return (
		<div className="logo" aria-label="QuickPitch AI">
			<span className="wordmark-name"><b>quick</b>pitch</span>
			<span className="wordmark-ai">AI</span>
		</div>
	);
}

export function Site() {
	const [page] = useHashRoute();
	const policy = page ? POLICIES[page] : undefined;

	useEffect(() => {
		document.title = policy ? `${policy.title} | QuickPitch AI` : "QuickPitch AI | From call notes to client-ready proposals";
		// In-page anchors like #how-it-works share the hash with routes, so only reset scroll on page changes.
		if (policy || !page) scrollTo(0, 0);
	}, [page, policy]);

	return (
		<div className="marketing">
			<a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
			<header className="marketing-nav">
				<a className="marketing-brand" href="#/" aria-label="QuickPitch AI home"><Logo /></a>
				<nav aria-label="Site">
					<a href="#how-it-works">How it works</a>
					<a href="#examples">Examples</a>
					<a href="#get-started">Get started</a>
					<a href="#contact">Contact</a>
				</nav>
				<a className="pill" href={REPO} target="_blank" rel="noreferrer">GitHub<span className="sr-only"> (opens in a new tab)</span> ↗</a>
			</header>
			<main id="main" tabIndex={-1}>{policy ? <Policy {...policy} /> : <Home />}</main>
			<footer className="marketing-footer">
				<div>
					<Logo />
					<p>Proposal writing for bespoke work.<br />A product of {COMPANY}.</p>
					<p><a href={`mailto:${EMAIL}`}>{EMAIL}</a> · <a href="https://www.blyftit.com" target="_blank" rel="noreferrer">blyftit.com<span className="sr-only"> (opens in a new tab)</span></a></p>
				</div>
				<nav aria-label="Legal">
					{Object.entries(POLICIES).map(([slug, p]) => <a key={slug} href={`#/${slug}`}>{p.title}</a>)}
				</nav>
				<p className="copyright">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
			</footer>
		</div>
	);
}

function Home() {
	return (
		<>
			<section className="hero">
				<div className="hero-copy">
					<p className="eyebrow">Proposals, made simpler</p>
					<h1>Good work deserves a <em>clear proposal.</em></h1>
					<p className="hero-lede">QuickPitch turns your call notes into a client-ready proposal. You bring the details and make the decisions. It helps with the writing.</p>
					<div className="hero-actions">
						<a className="btn" href="#get-started">Get started</a>
						<a className="pill" href="#how-it-works">How it works</a>
					</div>
				</div>
				<figure className="hero-art">
					<div className="preview-sheet" aria-hidden="true">
						<span className="preview-brand">qp<span>.</span></span>
						<i className="preview-line short" />
						<strong>Digital platform<br />proposal</strong>
						<span className="preview-client">Prepared for a sample client</span>
						<div className="preview-price"><small>PROJECT INVESTMENT</small><b>₹2,85,000 <small>+ GST</small></b></div>
						<i className="preview-line" /><i className="preview-line medium" />
						<footer>Scope · Schedule · Terms</footer>
					</div>
					<div className="preview-note" aria-hidden="true"><small>CALL NOTES</small><p>creator portal<br />brand dashboard<br />₹2.85L + GST<br />8 weeks</p></div>
					<figcaption>Illustration with sample data: rough call notes become a structured proposal.</figcaption>
				</figure>
			</section>

			<section className="band" id="how-it-works" aria-labelledby="how-title">
				<div className="section-intro"><p className="eyebrow">How it works</p><h2 id="how-title">Less time formatting. More time with clients.</h2></div>
				<ol className="simple-steps">
					<li><strong>1. Add your notes</strong><span>Client, scope, budget. Start with what you have.</span></li>
					<li><strong>2. Choose a length</strong><span>Quick quote, standard proposal, comparison or detailed proposal.</span></li>
					<li><strong>3. Review and send</strong><span>Check every number and line, then save it as a PDF.</span></li>
				</ol>
			</section>

			<section className="examples" id="examples" aria-labelledby="examples-title">
				<p className="eyebrow">Real proposals</p>
				<h2 id="examples-title">Every proposal fits the deal.</h2>
				<p className="examples-note">Written with QuickPitch from call notes, then designed by the team.</p>
				<div className="example-grid">
					{EXAMPLES.map((e) => (
						<figure key={e.src}>
							<img src={e.src} alt={e.alt} width={e.w} height={e.h} loading="lazy" decoding="async" />
							<figcaption><strong>{e.title}</strong>{e.detail}</figcaption>
						</figure>
					))}
				</div>
			</section>

			<section className="features" aria-labelledby="features-title">
				<h2 id="features-title">Clear structure. Your voice.</h2>
				<article><h3>Start with rough notes</h3><p>No template to fill out. Add the details from your conversation and keep moving.</p></article>
				<article><h3>Fit the proposal to the deal</h3><p>Choose the length and level of detail the client needs to make a decision.</p></article>
				<article><h3>You stay in control of the numbers</h3><p>Prices and terms come from your notes and your business profile. Anything missing is marked "To be confirmed" for you to fill in. AI can make mistakes, so review every proposal before you send it.</p></article>
			</section>

			<section className="band" id="get-started" aria-labelledby="start-title">
				<div className="section-intro"><p className="eyebrow">Get started</p><h2 id="start-title">Runs on your own computer.</h2></div>
				<div className="start-copy">
					<p>This website doesn't generate proposals. QuickPitch runs on your machine and writes with your own Claude plan through Claude Code. There are no API keys and no per-proposal fee. Your notes and proposals are saved on your computer.</p>
					<p>You need <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js 20+<span className="sr-only"> (opens in a new tab)</span></a> and <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code<span className="sr-only"> (opens in a new tab)</span></a>, signed in with your Claude account.</p>
					<pre><code>{`git clone ${REPO}.git\ncd QuickPitchAi\nnpm install\nnpm run dev`}</code></pre>
					<p>Then open <code>http://localhost:5173</code> and create your business profile.</p>
				</div>
			</section>

			<section className="band" id="contact" aria-labelledby="contact-title">
				<div className="section-intro"><p className="eyebrow">Contact</p><h2 id="contact-title">Want QuickPitch for your team?</h2></div>
				<ContactForm />
			</section>
		</>
	);
}

const EXAMPLES = [
	{ src: "/loopus.jpg", w: 919, h: 1300, title: "LoopUs × BLYFT", detail: "Website and platform proposal, one page",
		alt: "One-page website proposal for LoopUs: three problems with the current site, four modules to build, ₹2,85,000 + GST starting investment and an 8-week timeline." },
	{ src: "/superyou.png", w: 1304, h: 1846, title: "LoopUs × Superyou", detail: "Monthly influencer campaign, one page",
		alt: "One-page influencer campaign proposal for Superyou: 50 creators a month across three product lines, ₹1,90,000 a month + GST and a four-week rollout." },
	{ src: "/comet.png", w: 1266, h: 1776, title: "BLYFT × Comet", detail: "8-week social media campaign quotation",
		alt: "Quotation for a Comet sneaker social media campaign: scope of work, ₹1,75,000 campaign fee, payment terms, an optional ₹45,000 a month retainer and add-ons." },
];

// ponytail: no backend on the hosted site, so the form opens the visitor's email app with the message filled in.
// Nothing is stored or sent by this page. Swap for a form endpoint if you need submissions without an email app.
function ContactForm() {
	const [sent, setSent] = useState(false);
	const submit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const f = new FormData(e.currentTarget);
		const body = `${f.get("message")}\n\n${f.get("name")}\n${f.get("email")}`;
		location.href = `mailto:${EMAIL}?subject=${encodeURIComponent("QuickPitch AI enquiry")}&body=${encodeURIComponent(body)}`;
		setSent(true);
	};
	return (
		<form className="contact-form" onSubmit={submit}>
			<label>Your name<input name="name" autoComplete="name" required /></label>
			<label>Email<input name="email" type="email" autoComplete="email" required /></label>
			<label>Message<textarea name="message" rows={4} required /></label>
			<label className="check">
				<input type="checkbox" name="consent" required />
				<span>I agree that {COMPANY} can use these details to reply to me, as described in the <a href="#/privacy">Privacy Policy</a>.</span>
			</label>
			<button type="submit" className="btn">Open in my email app</button>
			<p className="form-note" role="status">{sent
				? `Your email app should now be open with the message ready. Press send there. If nothing opened, email us at ${EMAIL}.`
				: "This opens your email app with your message filled in. Nothing is sent until you press send."}</p>
		</form>
	);
}

function Policy({ title, body }: { title: string; body: ReactNode }) {
	return (
		<article className="policy">
			<p className="eyebrow"><a href="#/">← Home</a></p>
			<h1>{title}</h1>
			<p className="muted">Last updated {UPDATED}</p>
			{body}
			<h2>Contact</h2>
			<p>{COMPANY} · <a href={`mailto:${EMAIL}`}>{EMAIL}</a> · <a href="https://www.blyftit.com">www.blyftit.com</a></p>
		</article>
	);
}

const POLICIES: Record<string, { title: string; body: ReactNode }> = {
	privacy: {
		title: "Privacy Policy",
		body: (
			<>
				<p>This policy explains what data QuickPitch AI and this website collect, and why. QuickPitch AI is a product of {COMPANY} ("we", "us").</p>
				<h2>What user data we collect</h2>
				<table>
					<thead><tr><th scope="col">Where</th><th scope="col">What</th><th scope="col">Why</th><th scope="col">Kept</th></tr></thead>
					<tbody>
						<tr><td>This website</td><td>Nothing directly. No accounts, analytics, advertising or tracking.</td><td>-</td><td>-</td></tr>
						<tr><td>Hosting (Vercel)</td><td>Standard request logs: IP address, browser type, page requested, time.</td><td>Delivering the site and protecting it from abuse.</td><td>Per Vercel's retention, typically days.</td></tr>
						<tr><td>Contact form or email</td><td>Your name, email address and message, but only if you press send in your email app.</td><td>Replying to you.</td><td>Until your enquiry is resolved, then up to 12 months unless you ask us to delete it sooner.</td></tr>
						<tr><td>QuickPitch app on your computer</td><td>Business profile, client notes and proposals.</td><td>Writing your proposals.</td><td>On your computer only (<code>data/db.json</code>). We never receive it.</td></tr>
					</tbody>
				</table>
				<h2>AI processing</h2>
				<p>When you generate a proposal, the app sends your notes and business profile to Anthropic through Claude Code on your own Claude account. That is covered by your agreement with Anthropic and <a href="https://www.anthropic.com/legal/privacy">Anthropic's privacy policy</a>. We do not see or store it.</p>
				<h2>Third parties</h2>
				<p>This website has no third-party embeds: no videos, maps, social widgets, chat widgets, ad pixels or external fonts. Third parties involved: Vercel (hosting), GitHub (if you follow the source code link), your own email provider (contact form), and Anthropic (the app, as above).</p>
				<h2>We don't sell your data</h2>
				<p>We do not sell, rent or share personal data for advertising.</p>
				<h2>Your rights</h2>
				<p>You can ask to access, correct or delete the personal data we hold about you, or withdraw consent, by emailing us. We reply within 30 days. This includes rights under India's Digital Personal Data Protection Act, 2023 and, where it applies, the GDPR. You may also complain to your local data protection authority.</p>
				<h2>Children</h2>
				<p>QuickPitch is a business tool and is not directed at anyone under 18.</p>
				<h2>Changes</h2>
				<p>If we change this policy we will update the date above.</p>
			</>
		),
	},
	terms: {
		title: "Terms and Conditions",
		body: (
			<>
				<p>By using this website or the QuickPitch AI software, you agree to these terms.</p>
				<h2>The software</h2>
				<p>The QuickPitch AI source code is available on <a href={REPO}>GitHub</a> and runs on your own computer. It is provided "as is", without warranties of any kind, to the fullest extent permitted by law.</p>
				<h2>Your responsibility for proposals</h2>
				<p>QuickPitch uses AI to draft proposals from the information you provide. AI output can be wrong or incomplete. You are responsible for reviewing every proposal, including prices, scope, taxes and terms, before you send it to anyone. Proposals you create belong to you.</p>
				<h2>Your Claude account</h2>
				<p>Generating proposals uses your own Claude plan through Claude Code, which is subject to Anthropic's terms. Any usage limits or charges on that account are between you and Anthropic.</p>
				<h2>Acceptable use</h2>
				<p>Don't use QuickPitch to create misleading, fraudulent or unlawful documents, or to impersonate another business.</p>
				<h2>Limitation of liability</h2>
				<p>To the fullest extent permitted by law, {COMPANY} is not liable for indirect or consequential losses, or for losses arising from proposals you send, including pricing or scope errors.</p>
				<h2>Governing law</h2>
				<p>These terms are governed by the laws of India.</p>
			</>
		),
	},
	cookies: {
		title: "Cookie Policy",
		body: (
			<>
				<p>This website does not set any cookies and does not use tracking technologies such as analytics, advertising pixels or fingerprinting. That is why there is no cookie banner: there is nothing to consent to.</p>
				<p>The QuickPitch app you run on your own computer stores which account you last used in your browser's local storage, on that computer only. It is strictly necessary for the app to work and is never sent to us.</p>
				<p>If we ever add non-essential cookies, we will update this policy and ask for your consent first.</p>
			</>
		),
	},
	refunds: {
		title: "Refund Policy",
		body: (
			<>
				<p>QuickPitch AI is currently free. We do not charge for the software or for this website, so there are no payments to refund.</p>
				<p>Proposal generation uses your own Claude plan, which is billed by Anthropic, not by us. Refunds for that are handled under Anthropic's terms.</p>
				<p>If we introduce paid plans, we will publish refund terms here before taking any payment.</p>
			</>
		),
	},
	accessibility: {
		title: "Accessibility",
		body: (
			<>
				<p>We aim for this website to meet WCAG 2.1 level AA. It supports keyboard navigation with visible focus, has a skip link, uses labelled form fields, text alternatives for images, and colour contrast of at least 4.5:1 for text.</p>
				<p>If anything is hard to use, please email us and we will fix it.</p>
			</>
		),
	},
};
