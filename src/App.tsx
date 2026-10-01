import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { api, type ProfileSummary } from "./api";
import { supabase } from "./auth";
import { ClientPage, ClientsPage } from "./clients";
import { Dashboard, NewProposal, ProfileForm, ProposalsPage } from "./pages";
import { ProposalPage } from "./proposalPage";
import { LOGO_VERSION, useLoad, withFoundLogo } from "./ui";
import type { Profile } from "./proposal";
import { Logo, Site, useHashRoute } from "./site";

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

export const initials = (name: string) =>
	name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function App() {
	// Hosted: the marketing site, with the invite-only app at /app.
	if (import.meta.env.PROD) return location.pathname.startsWith("/app") ? <HostedApp /> : <Site />;
	return <LocalApp />;
}

function HostedApp() {
	if (!supabase) return <div className="auth"><p className="auth-card error" role="alert">Login isn't set up yet.</p></div>;
	return <HostedSession />;
}

function HostedSession() {
	const [session, setSession] = useState<Session | null | undefined>(undefined);
	useEffect(() => {
		supabase!.auth.getSession().then(({ data }) => setSession(data.session));
		const { data } = supabase!.auth.onAuthStateChange((_event, s) => setSession(s));
		return () => data.subscription.unsubscribe();
	}, []);
	if (session === undefined) return null;
	if (!session) return <EmailLogin />;
	return <LocalApp />;
}

function EmailLogin() {
	const [email, setEmail] = useState("");
	const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
	const send = async (e: React.FormEvent) => {
		e.preventDefault();
		setState("sending");
		const { error } = await supabase!.auth.signInWithOtp({
			email: email.trim(),
			options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/app` },
		});
		setState(error ? "That email isn't invited yet, or the link couldn't be sent. Try again." : "sent");
	};
	return (
		<div className="auth">
			<div className="auth-card">
				<Logo />
				<h1>Log in to QuickPitch</h1>
				{state === "sent" ? (
					<p className="muted">Check your inbox for a login link from QuickPitch. Open it in this browser.</p>
				) : (
					<form onSubmit={send}>
						<label className="field">
							Work email
							<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
						</label>
						{state !== "idle" && state !== "sending" && <p className="error" role="alert">{state}</p>}
						<button type="submit" className="btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a login link"}</button>
					</form>
				)}
			</div>
		</div>
	);
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
				{supabase && <button type="button" className="link" onClick={() => supabase!.auth.signOut()}>Log out</button>}
			</div>
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

// Once per session: clean up logos saved before the logo pipeline existed, and find missing ones.
function useLogoUpkeep(profile: Profile, onProfileSaved: () => void) {
	const done = useRef(false);
	useEffect(() => {
		if (done.current) return;
		done.current = true;
		const stale = (x: { logo: string; logoVersion: number; website: string }) =>
			x.logo ? x.logoVersion < LOGO_VERSION : Boolean(x.website.trim());
		(async () => {
			if (stale(profile)) {
				const fixed = await withFoundLogo(profile);
				if (fixed.logo !== profile.logo) {
					await api.updateProfile(profile.id, fixed);
					onProfileSaved();
				}
			}
			for (const c of await api.clients(profile.id)) {
				if (!stale(c)) continue;
				const fixed = await withFoundLogo(c);
				if (fixed.logo !== c.logo) await api.updateClient(c.id, fixed);
			}
		})().catch(() => {});
	}, [profile, onProfileSaved]);
}

function Shell({ profile, onSignOut, onProfileSaved }: { profile: Profile; onSignOut: () => void; onProfileSaved: () => void }) {
	const [page, id, sub] = useHashRoute();
	useLogoUpkeep(profile, onProfileSaved);

	let content;
	if (page === "new" && id === "client") content = <NewProposal key={`c-${sub}`} profile={profile} clientId={sub} />;
	else if (page === "new") content = <NewProposal key={id ?? "new"} profile={profile} fromId={id} />;
	else if (page === "proposals" && id) content = <ProposalPage key={id} id={id} profile={profile} />;
	else if (page === "proposals") content = <ProposalsPage profile={profile} />;
	else if (page === "clients" && id) content = <ClientPage key={id} id={id} profile={profile} />;
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
		<div className="shell">
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
					{profile.logo ? (
						<img className={`avatar logo-avatar ${profile.logoTone}`} src={profile.logo} alt="" />
					) : (
						<span className="avatar" style={{ background: profile.accent }}>{initials(profile.name)}</span>
					)}
					<span><strong>{profile.name}</strong><small>{profile.company}</small></span>
					<button type="button" className="link" onClick={onSignOut}>Switch</button>
				</div>
			</nav>
			<main>{content}</main>
		</div>
	);
}
