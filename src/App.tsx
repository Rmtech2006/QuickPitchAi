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
