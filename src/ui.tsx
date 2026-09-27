import { type DependencyList, useCallback, useEffect, useState } from "react";
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
	return <span className={`pill ${status.toLowerCase()}`}>{status}</span>;
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
