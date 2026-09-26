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
				<nav aria-label="Site navigation"><a href="#how-it-works">How it works</a><a href="#about">About</a></nav>
				<a className="text-link" href={REPO} target="_blank" rel="noreferrer">View on GitHub ↗</a>
			</header>
			<main className="marketing-main" id="top">
				<section className="hero">
					<div className="hero-copy">
						<p className="eyebrow">Proposals, made simpler</p>
						<h1>Good work deserves<br/>a <em>clear proposal.</em></h1>
						<p className="hero-lede">QuickPitch turns your call notes into a client-ready proposal. You bring the details. It helps with the writing.</p>
						<div className="hero-actions"><a className="btn" href="#how-it-works">How it works <span aria-hidden="true">↓</span></a><a className="text-link" href="mailto:hello@blyftit.com?subject=QuickPitch%20AI">Get in touch ↗</a></div>
					</div>
					<div className="hero-art" aria-label="Abstract blue grid inspired by a proposal taking shape">
						<div className="grid-mark" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
						<div className="grid-caption"><span>NOTES</span><b>→</b><span>STRUCTURE</span><b>→</b><span>PROPOSAL</span><i>01 / 03</i></div>
					</div>
				</section>

				<section className="story-section" id="how-it-works">
					<div className="section-intro"><p className="eyebrow">[ 01 / THE WORKFLOW ]</p><h2>Less time formatting.<br/>More time with clients.</h2></div>
					<div className="story-copy"><ol className="simple-steps"><li><strong>01 &nbsp; Add your notes</strong><span>Client, scope, budget. Start with what you have.</span></li><li><strong>02 &nbsp; Choose a format</strong><span>Quick quote, standard proposal or comparison.</span></li><li><strong>03 &nbsp; Review and send</strong><span>Make the final call, then save as a PDF.</span></li></ol></div>
				</section>
				<section className="feature-row"><div className="feature-heading"><p className="eyebrow">[ 02 / BUILT FOR THE DETAILS ]</p><h2>Clear structure.<br/>Your voice.</h2></div><article><span className="feature-index">// 001</span><div className="feature-glyph glyph-note">Aa</div><h3>Start with rough notes</h3><p>No template to fill out. Add the details from your conversation and keep moving.</p></article><article><span className="feature-index">// 002</span><div className="feature-glyph glyph-stack"><i/><i/><i/></div><h3>Fit the proposal to the deal</h3><p>Choose the length and level of detail the client needs to make a decision.</p></article><article><span className="feature-index">// 003</span><div className="feature-glyph glyph-check">✓</div><h3>Keep control of the numbers</h3><p>Your pricing and terms stay yours. Review every proposal before it leaves your desk.</p></article></section>
			</main>
			<footer className="marketing-footer" id="about"><a className="marketing-brand" href="#top"><Logo /></a><span>Proposal writing for bespoke work.</span><span><a href="mailto:hello@blyftit.com">Contact ↗</a> &nbsp; · &nbsp; BLYFT Technologies</span></footer>
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
