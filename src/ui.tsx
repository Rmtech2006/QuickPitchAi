import { type DependencyList, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { processLogo, type Tone } from "./logo";
import type { Status, StoredProposal } from "./proposal";

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
export function ago(iso: string) {
	const s = (new Date(iso).getTime() - Date.now()) / 1000;
	for (const [unit, secs] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const)
		if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit);
	return "just now";
}

export function StatusPill({ status }: { status: Status }) {
	return <span className={`status ${status.toLowerCase()}`}>{status}</span>;
}

export function ProposalTable({ items, empty, onDelete }: {
	items: StoredProposal[];
	empty: React.ReactNode;
	onDelete?: (id: string) => Promise<void>;
}) {
	const [confirming, setConfirming] = useState<string>();
	if (!items.length) return <div className="empty">{empty}</div>;
	const open = (id: string) => (location.hash = `#/proposals/${id}`);
	return (
		<table className="list clickable">
			<thead><tr><th>Title</th><th>Client</th><th>Status</th><th>Updated</th>{onDelete && <th><span className="sr-only">Actions</span></th>}</tr></thead>
			<tbody>
				{items.map((p) => (
					<tr key={p.id} onClick={() => open(p.id)}>
						<td><a href={`#/proposals/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.title}</a></td>
						<td>{p.client}</td>
						<td><StatusPill status={p.status} /></td>
						<td className="muted">{ago(p.updatedAt)}</td>
						{onDelete && (
							<td className="row-actions" onClick={(e) => e.stopPropagation()}>
								{confirming === p.id ? (
									<>
										<button type="button" className="link-btn danger-text" onClick={() => onDelete(p.id).then(() => setConfirming(undefined))}>Delete</button>
										<button type="button" className="link-btn muted" onClick={() => setConfirming(undefined)}>Cancel</button>
									</>
								) : (
									<button type="button" className="link-btn muted" aria-label={`Delete ${p.title}`} onClick={() => setConfirming(p.id)}>Delete</button>
								)}
							</td>
						)}
					</tr>
				))}
			</tbody>
		</table>
	);
}

const MAX_LOGO_BYTES = 1_000_000;
export const LOGO_VERSION = 1;

type Logo = { logo: string; logoTone: Tone; logoVersion: number };
type HasLogo = { logo?: string; logoTone?: Tone; logoVersion?: number; website?: string };

async function fromWebsite(website?: string) {
	if (!website?.trim()) return null;
	try {
		return await processLogo((await api.findLogo(website)).dataUrl);
	} catch {
		return null;
	}
}

// Clean up a logo; if it's poor quality and the website has a good one, use that instead.
export async function bestLogo(dataUrl: string, website?: string): Promise<Logo & { note: string; poor: boolean }> {
	const own = await processLogo(dataUrl);
	if (own.poor) {
		const site = await fromWebsite(website);
		if (site && !site.poor)
			return { logo: site.dataUrl, logoTone: site.tone, logoVersion: LOGO_VERSION, poor: false, note: "That logo was too small or had a busy background, so we used the one from the website. Upload a larger PNG or SVG to replace it." };
	}
	return {
		logo: own.dataUrl, logoTone: own.tone, logoVersion: LOGO_VERSION, poor: own.poor,
		note: own.poor ? "This logo is low quality and may look blurry. A larger PNG or an SVG works best." : "Done. Background and padding removed automatically.",
	};
}

// Missing logo: fetch one from the website. Old logo: clean it up once. Never blocks saving.
export async function withFoundLogo<T extends HasLogo>(item: T): Promise<T> {
	try {
		if (item.logo && (item.logoVersion ?? 0) >= LOGO_VERSION) return item;
		if (item.logo) {
			const b = await bestLogo(item.logo, item.website);
			return { ...item, logo: b.logo, logoTone: b.logoTone, logoVersion: b.logoVersion };
		}
		const site = await fromWebsite(item.website);
		return site ? { ...item, logo: site.dataUrl, logoTone: site.tone, logoVersion: LOGO_VERSION } : item;
	} catch {
		return item;
	}
}

export function LogoPicker({ value, tone, website, onChange }: {
	value: string;
	tone: Tone;
	website?: string;
	onChange: (logo: string, tone: Tone, version: number) => void;
}) {
	const [status, setStatus] = useState<{ ok: boolean; text: string }>();
	const [busy, setBusy] = useState(false);

	async function use(dataUrl: string, fromSite: boolean) {
		const b = await bestLogo(dataUrl, fromSite ? undefined : website);
		onChange(b.logo, b.logoTone, b.logoVersion);
		setStatus({ ok: !b.poor, text: fromSite && !b.poor ? "Found on the website. Check it looks right, or upload your own." : b.note });
	}
	async function pick(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		if (file.size > MAX_LOGO_BYTES) return setStatus({ ok: false, text: "Logo must be under 1 MB." });
		const reader = new FileReader();
		reader.onload = () => use(String(reader.result), false).catch((err) => setStatus({ ok: false, text: String(err.message ?? err) }));
		reader.readAsDataURL(file);
	}
	async function find() {
		if (!website) return;
		setBusy(true);
		setStatus(undefined);
		try {
			await use((await api.findLogo(website)).dataUrl, true);
		} catch (err) {
			setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="logo-upload">
			<div className={`logo-preview ${value ? tone : ""}`}>{value ? <img src={value} alt="Logo preview" /> : <span className="muted small">No logo</span>}</div>
			<div className="logo-actions">
				<div className="row-gap">
					<label className="btn ghost file-btn">
						{value ? "Replace" : "Upload logo"}
						<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick} className="sr-only" />
					</label>
					<button type="button" className="btn ghost" disabled={!website?.trim() || busy} onClick={find}>
						{busy ? "Looking…" : "Find on website"}
					</button>
					{value && <button type="button" className="link-btn muted" onClick={() => { onChange("", "dark", 0); setStatus(undefined); }}>Remove</button>}
				</div>
				<small className="muted block">PNG, JPG, WebP or SVG under 1 MB. We remove a solid background and extra padding for you.</small>
				{status && <p className={`small ${status.ok ? "muted" : "error"}`} role="status">{status.text}</p>}
			</div>
		</div>
	);
}
