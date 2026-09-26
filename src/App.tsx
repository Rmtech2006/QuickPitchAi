import { useEffect, useState } from "react";
import { api, type ProfileSummary } from "./api";
import {
	ClientsPage, Dashboard, NewProposal, ProfileForm, ProposalPage, ProposalsPage, useLoad,
} from "./pages";
import type { Profile } from "./proposal";

function load(key: string) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function save(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {}
}

function useHashRoute() {
	const [hash, setHash] = useState(location.hash);
	useEffect(() => {
		const on = () => setHash(location.hash);
		addEventListener("hashchange", on);
		return () => removeEventListener("hashchange", on);
	}, []);
	return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

export const initials = (name: string) =>
	name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function App() {
	// The hosted build has no local server or Claude login, so it only explains how to run it.
	if (import.meta.env.PROD) return <RunLocally />;
	return <LocalApp />;
}

function LocalApp() {
	const [profileId, setProfileId] = useState(() => load("qp.profile"));
	const profile = useLoad(() => (profileId ? api.profile(profileId) : Promise.resolve(null)), [profileId]);

	const signIn = (id: string | null) => {
		save("qp.profile", id);
		setProfileId(id);
		location.hash = "#/";
	};

	if (profile.loading) return null;
	if (!profile.data) return <SignIn onSignIn={signIn} />;
	return <Shell profile={profile.data} onSignOut={() => signIn(null)} onProfileSaved={profile.reload} />;
}

// ponytail: local accounts with no password, since this only runs on your own machine.
// Add real auth (e.g. Supabase or Clerk) before hosting it for other people.
function SignIn({ onSignIn }: { onSignIn: (id: string) => void }) {
	const profiles = useLoad(api.profiles, []);
	const [creating, setCreating] = useState(false);

	if (profiles.loading) return null;
	if (profiles.error) return <div className="auth"><p className="auth-card error" role="alert">{profiles.error}</p></div>;
	if (creating || profiles.data?.length === 0)
		return (
			<div className="auth">
				<div className="auth-card wide">
					<Logo />
					<h1>Tell us about your business</h1>
					<p className="muted">Do this once. Every proposal you generate will already know what you do, what you charge and how you like to sound.</p>
					<ProfileForm
						submitLabel="Create account"
						onSave={async (input) => onSignIn((await api.createProfile(input)).id)}
						onCancel={profiles.data?.length ? () => setCreating(false) : undefined}
					/>
				</div>
			</div>
		);

	return (
		<div className="auth">
			<div className="auth-card">
				<Logo />
				<h1>Who's working?</h1>
				<div className="accounts">
					{profiles.data?.map((p: ProfileSummary) => (
						<button type="button" key={p.id} className="account" onClick={() => onSignIn(p.id)}>
							<span className="avatar" style={{ background: p.accent }}>{initials(p.name)}</span>
							<span><strong>{p.name}</strong><small>{p.company}</small></span>
						</button>
					))}
				</div>
				<button type="button" className="btn ghost" onClick={() => setCreating(true)}>+ New account</button>
			</div>
		</div>
	);
}

const REPO = "https://github.com/Rmtech2006/QuickPitchAi";

// Public homepage for the hosted build.
function RunLocally() {
	return (
		<div className="marketing">
			<header className="marketing-nav">
				<a className="marketing-brand" href="#top" aria-label="QuickPitch AI home"><Logo /></a>
				<nav aria-label="Site navigation"><a href="#how-it-works">How it works</a><a href="#who-its-for">Who it’s for</a><a href="#about">About</a></nav>
				<a className="btn" href={REPO} target="_blank" rel="noreferrer">Explore the project <span aria-hidden="true">↗</span></a>
			</header>
			<main className="marketing-main" id="top">
				<section className="hero">
					<div className="hero-copy">
						<p className="eyebrow">From the call to the client-ready proposal</p>
						<h1>The proposal is the pitch.<br/><em>Send it while it’s fresh.</em></h1>
						<p className="hero-lede">Turn rough notes, real pricing and a few good decisions into a clear proposal your client can say yes to.</p>
						<div className="hero-actions"><a className="btn" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a><a className="text-link" href="#partners">We’re looking for design partners <span aria-hidden="true">↗</span></a></div>
						<div className="hero-proof"><span className="proof-mark">✳</span><span><strong>Your judgment stays yours.</strong><br/>QuickPitch handles the writing and structure.</span></div>
					</div>
					<div className="hero-art" aria-label="A proposal coming together from call notes">
						<div className="note-card"><span className="mini-label">AFTER THE CALL · 4:18 PM</span><p>LoopUs platform<br/>site not showing on Google<br/>creator portal + brand dashboard<br/>₹2.85L + GST · 8 weeks</p><div className="note-scribble">rough notes, real thinking</div></div>
						<div className="flow-arrow" aria-hidden="true">↘</div>
						<div className="proposal-card"><div className="proposal-top"><span className="proposal-brand">qp<span>.</span></span><span>PROPOSAL · 01</span></div><div className="proposal-rule"/><p className="proposal-kicker">A clearer path to growth</p><h2>LoopUs<br/>Digital Platform</h2><p className="proposal-sub">Prepared for LoopUs · September 2026</p><div className="proposal-detail"><span>Recommended investment</span><strong>₹2,85,000 <small>+ GST</small></strong></div><div className="proposal-lines"><i/><i/><i/></div><div className="proposal-footer"><span>Scope · Schedule · Terms</span><span>01 / 08</span></div></div>
						<div className="time-stamp"><strong>90 sec</strong><span>of example<br/>call notes</span></div>
					</div>
				</section>

				<div className="signal-strip"><span>BUILT FOR BESPOKE WORK</span><div>Development studios <b>✳</b> Design teams <b>✳</b> Consultants <b>✳</b> Agencies <b>✳</b> IT services</div></div>

				<section className="story-section" id="how-it-works">
					<div className="section-intro"><p className="eyebrow">The work is the assembly</p><h2>You already know<br/>what to recommend.</h2></div>
					<div className="story-copy"><p>You know the client, the scope and what it should cost. But after the call, that thinking is scattered across messages and memory. Turning it into a proposal takes a day.</p><p>QuickPitch turns the pieces you already have into a considered document, so you can send the proposal while the conversation is still alive.</p><a className="text-link" href="#steps">Meet your new post-call ritual <span aria-hidden="true">↓</span></a></div>
				</section>

				<section className="steps-section" id="steps">
					<div className="steps-heading"><p className="eyebrow">Simple in. Ready to send.</p><h2>Keep the thinking.<br/><em>Skip the blank page.</em></h2></div>
					<div className="steps-grid">
						<article className="step-card"><span className="step-no">01</span><div className="step-icon notes-icon">Aa<span>+</span></div><h3>Drop in what you know</h3><p>Half-sentences straight after the call. No template to choose and no fields to fill in order.</p><div className="step-caption">YOUR WORDS, AS THEY ARE</div></article>
						<article className="step-card"><span className="step-no">02</span><div className="step-icon structure-icon"><i/><i/><i/></div><h3>Let the deal shape it</h3><p>QuickPitch organizes the scope, options, recommendation, investment and next steps around the opportunity.</p><div className="step-caption">STRUCTURE THAT FITS</div></article>
						<article className="step-card"><span className="step-no">03</span><div className="step-icon send-icon">↗</div><h3>Send a finished proposal</h3><p>A branded, consistent PDF that’s one page or eight. Choose the detail the deal deserves.</p><div className="step-caption">YOUR BRAND, READY TO SHARE</div></article>
					</div>
				</section>

				<section className="control-section" id="who-its-for">
					<div className="control-copy"><p className="eyebrow">Your expertise stays in charge</p><h2>QuickPitch writes<br/>the document.<br/><em>You keep the judgment.</em></h2><p>Your notes and business profile guide each proposal. Pricing and terms come from what you provide. If a number is missing, QuickPitch marks it for confirmation instead of making one up.</p><div className="control-points"><span>✓ Your prices and terms</span><span>✓ Your client context</span><span>✓ Your final say</span></div></div>
					<div className="format-card"><div className="format-head"><span>ONE CONVERSATION</span><span>↗</span></div><div className="format-input">“Two routes: a focused site refresh, or a full platform with creator and brand portals. They’re losing leads from search. Budget around 2.85L, eight weeks.”</div><div className="format-divider"><span>SHAPE IT FOR THE DEAL</span></div><div className="format-options"><div><b>01</b><span><strong>Quick quote</strong><small>Clear scope and investment</small></span><i>1 page</i></div><div className="recommended-option"><b>02</b><span><strong>Compare options</strong><small>Trade-offs and a recommendation</small></span><i>8 pages</i></div><div><b>03</b><span><strong>Detailed proposal</strong><small>Method, milestones and terms</small></span><i>30 pages</i></div></div></div>
				</section>

				<section className="audience-section"><p className="eyebrow">Made for the work that changes every time</p><h2>Built for teams that quote bespoke work every week.</h2><div className="audience-list"><span>Development agencies</span><span>Design studios</span><span>Marketing teams</span><span>Architecture & interiors</span><span>Independent consultants</span><span>IT services</span><span>Event & production</span><span>Custom manufacturing</span></div></section>

				<section className="partners-section" id="partners"><div><p className="eyebrow">Research phase · Feedback welcome</p><h2>Help shape the proposal tool<br/>you wish you already had.</h2><p>We’re looking for ten design partners to run a real proposal through QuickPitch AI and tell us where it falls short.</p></div><a className="btn light-btn" href="mailto:hello@blyftit.com?subject=QuickPitch%20AI%20design%20partner">Talk to us <span aria-hidden="true">↗</span></a></section>
			</main>
			<footer className="marketing-footer" id="about"><a className="marketing-brand" href="#top"><Logo /></a><span>A product of <a href="https://www.blyftit.com" target="_blank" rel="noreferrer">BLYFT Technologies ↗</a></span><span>QuickPitch AI · Research phase</span></footer>
		</div>
	);
}
function Logo() {
	return (
		<div className="logo">
			<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
				<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
			</svg>
			QuickPitch <span>AI</span>
		</div>
	);
}

const NAV = [
	["", "Home"],
	["new", "New proposal"],
	["proposals", "Proposals"],
	["clients", "Clients"],
	["profile", "Business profile"],
] as const;

function Shell({ profile, onSignOut, onProfileSaved }: { profile: Profile; onSignOut: () => void; onProfileSaved: () => void }) {
	const [page, id] = useHashRoute();

	let content;
	if (page === "new") content = <NewProposal key={id ?? "new"} profile={profile} fromId={id} />;
	else if (page === "proposals" && id) content = <ProposalPage key={id} id={id} profile={profile} />;
	else if (page === "proposals") content = <ProposalsPage profile={profile} />;
	else if (page === "clients") content = <ClientsPage profile={profile} />;
	else if (page === "profile")
		content = (
			<div className="page narrow">
				<h1>Business profile</h1>
				<p className="muted">This is what QuickPitch knows about you. It goes into every proposal.</p>
				<ProfileForm
					initial={profile}
					submitLabel="Save profile"
					onSave={async (input) => {
						await api.updateProfile(profile.id, input);
						onProfileSaved();
					}}
				/>
			</div>
		);
	else content = <Dashboard profile={profile} />;

	return (
		<div className="shell" style={{ "--accent": profile.accent } as React.CSSProperties}>
			<nav className="sidebar no-print" aria-label="Main">
				<Logo />
				<ul>
					{NAV.map(([path, label]) => (
						<li key={path}>
							<a href={`#/${path}`} aria-current={(page ?? "") === path ? "page" : undefined}>{label}</a>
						</li>
					))}
				</ul>
				<div className="me">
					<span className="avatar" style={{ background: profile.accent }}>{initials(profile.name)}</span>
					<span><strong>{profile.name}</strong><small>{profile.company}</small></span>
					<button type="button" className="link" onClick={onSignOut}>Switch</button>
				</div>
			</nav>
			<main>{content}</main>
		</div>
	);
}
