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

export function ProposalTable({ items, empty }: { items: StoredProposal[]; empty: React.ReactNode }) {
	if (!items.length) return <div className="empty">{empty}</div>;
	return (
		<table className="list">
			<thead><tr><th>Title</th><th>Client</th><th>Status</th><th>Updated</th></tr></thead>
			<tbody>
				{items.map((p) => (
					<tr key={p.id}>
						<td><a href={`#/proposals/${p.id}`}>{p.title}</a></td>
						<td>{p.client}</td>
						<td><StatusPill status={p.status} /></td>
						<td className="muted">{ago(p.updatedAt)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

const MAX_LOGO_BYTES = 1_000_000;

// If a client or profile has a website but no logo yet, fetch and clean one up. Never blocks saving.
export async function withFoundLogo<T extends { logo?: string; logoTone?: Tone; website?: string }>(item: T): Promise<T> {
	if (item.logo || !item.website?.trim()) return item;
	try {
		const found = await api.findLogo(item.website);
		const { dataUrl, tone } = await processLogo(found.dataUrl);
		return { ...item, logo: dataUrl, logoTone: tone };
	} catch {
		return item;
	}
}

export function LogoPicker({ value, tone, website, onChange }: {
	value: string;
	tone: Tone;
	website?: string;
	onChange: (logo: string, tone: Tone) => void;
}) {
	const [status, setStatus] = useState<{ ok: boolean; text: string }>();
	const [busy, setBusy] = useState(false);

	async function use(dataUrl: string, from: string) {
		const clean = await processLogo(dataUrl);
		onChange(clean.dataUrl, clean.tone);
		setStatus({ ok: true, text: from });
	}
	async function pick(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		if (file.size > MAX_LOGO_BYTES) return setStatus({ ok: false, text: "Logo must be under 1 MB." });
		const reader = new FileReader();
		reader.onload = () => use(String(reader.result), "Uploaded. Background and padding removed automatically.").catch((err) => setStatus({ ok: false, text: String(err.message ?? err) }));
		reader.readAsDataURL(file);
	}
	async function find() {
		if (!website) return;
		setBusy(true);
		setStatus(undefined);
		try {
			await use((await api.findLogo(website)).dataUrl, "Found on the website. Check it looks right, or upload your own.");
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
					{value && <button type="button" className="link-btn muted" onClick={() => { onChange("", "dark"); setStatus(undefined); }}>Remove</button>}
				</div>
				<small className="muted block">PNG, JPG, WebP or SVG under 1 MB. We remove a solid background and extra padding for you.</small>
				{status && <p className={`small ${status.ok ? "muted" : "error"}`} role="status">{status.text}</p>}
			</div>
		</div>
	);
}
