import { useState } from "react";
import { api } from "./api";
import type { Client, ClientInput, Profile } from "./proposal";
import { ago, LogoPicker, ProposalTable, StatusPill, useLoad, withFoundLogo } from "./ui";

const EMPTY_CLIENT: ClientInput = { name: "", website: "", contactName: "", email: "", phone: "", notes: "" };

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
const href = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);

// Used on the Clients page and inline in "New proposal".
export function ClientFields({ value, onChange }: { value: ClientInput; onChange: (c: ClientInput) => void }) {
	const set = (k: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
		onChange({ ...value, [k]: e.target.value });
	return (
		<div className="form-grid">
			<label>
				Client name
				<input required value={value.name} onChange={set("name")} placeholder="Comet" />
			</label>
			<label>
				Website
				<small className="muted">We design the proposal in their brand from this.</small>
				<input inputMode="url" value={value.website ?? ""} onChange={set("website")} placeholder="wearcomet.com" />
			</label>
			<label>
				Contact person
				<input value={value.contactName ?? ""} onChange={set("contactName")} placeholder="Aarav Shah, Marketing Head" />
			</label>
			<label>
				Email
				<input type="email" value={value.email ?? ""} onChange={set("email")} placeholder="aarav@wearcomet.com" />
			</label>
			<label>
				Phone
				<input type="tel" value={value.phone ?? ""} onChange={set("phone")} placeholder="+91 98765 43210" />
			</label>
			<div className="span-2 logo-field">
				<span className="field-label">Client logo</span>
				<LogoPicker
					value={value.logo ?? ""}
					tone={value.logoTone ?? "dark"}
					website={value.website}
					onChange={(logo, logoTone) => onChange({ ...value, logo, logoTone })}
				/>
			</div>
			<label className="span-2">
				Notes about this client
				<textarea rows={3} value={value.notes ?? ""} onChange={set("notes")} placeholder="Bengaluru sneaker brand, MSME (no GST). Prefers WhatsApp." />
			</label>
		</div>
	);
}

export function ClientForm({ initial, submitLabel, onSave, onCancel }: {
	initial?: ClientInput;
	submitLabel: string;
	onSave: (c: ClientInput) => Promise<void>;
	onCancel?: () => void;
}) {
	const [form, setForm] = useState<ClientInput>(() => ({ ...EMPTY_CLIENT, ...initial }));
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setMsg(undefined);
		try {
			const withLogo = await withFoundLogo(form);
			setForm(withLogo);
			await onSave(withLogo);
			setMsg({ ok: true, text: withLogo.logo && !form.logo ? "Saved. We found their logo on the website." : "Saved." });
		} catch (err) {
			setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="form" onSubmit={submit}>
			<ClientFields value={form} onChange={setForm} />
			{msg && <p className={msg.ok ? "ok" : "error"} role="status">{msg.text}</p>}
			<div className="actions">
				{onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
				<button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
			</div>
		</form>
	);
}

export function ClientsPage({ profile }: { profile: Profile }) {
	const clients = useLoad(() => api.clients(profile.id), [profile.id]);
	const proposals = useLoad(() => api.proposals(profile.id), [profile.id]);
	const [adding, setAdding] = useState(false);
	const forClient = (c: Client) => (proposals.data ?? []).filter((p) => p.clientId === c.id);

	return (
		<div className="page">
			<div className="page-head">
				<div>
					<h1>Clients</h1>
					<p className="muted">Save a client once. Every proposal for them picks up their website, brand and contacts.</p>
				</div>
				{!adding && <button type="button" className="btn" onClick={() => setAdding(true)}>+ Add client</button>}
			</div>

			{adding && (
				<section className="panel">
					<h2>New client</h2>
					<ClientForm
						submitLabel="Save client"
						onCancel={() => setAdding(false)}
						onSave={async (c) => {
							await api.createClient(profile.id, c);
							setAdding(false);
							clients.reload();
						}}
					/>
				</section>
			)}

			<section className="panel">
				{clients.error && <p className="error" role="alert">{clients.error}</p>}
				{!clients.loading && (clients.data?.length ? (
					<table className="list">
						<thead><tr><th>Client</th><th>Contact</th><th>Website</th><th>Proposals</th><th>Latest</th></tr></thead>
						<tbody>
							{clients.data.map((c) => {
								const items = forClient(c);
								return (
									<tr key={c.id}>
										<td><a href={`#/clients/${c.id}`}>{c.name}</a></td>
										<td>{c.contactName || c.email || <span className="muted">–</span>}{c.contactName && c.email && <small className="muted block">{c.email}</small>}</td>
										<td>{c.website ? <a href={href(c.website)} target="_blank" rel="noreferrer" className="plain">{host(c.website)}</a> : <span className="muted">–</span>}</td>
										<td>{items.length}</td>
										<td>{items[0] ? <StatusPill status={items[0].status} /> : <span className="muted">–</span>}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				) : (
					<div className="empty">No clients yet. <button type="button" className="link-btn" onClick={() => setAdding(true)}>Add your first client</button>.</div>
				))}
			</section>
		</div>
	);
}

export function ClientPage({ id, profile }: { id: string; profile: Profile }) {
	const client = useLoad(() => api.client(id), [id]);
	const proposals = useLoad(() => api.proposals(profile.id), [profile.id]);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const c = client.data;
	if (client.error || (c && c.profileId !== profile.id))
		return <div className="page"><p className="error">Client not found.</p></div>;
	if (!c) return null;
	const items = (proposals.data ?? []).filter((p) => p.clientId === c.id);

	return (
		<div className="page">
			<div className="toolbar">
				<a href="#/clients">← Clients</a>
				<a className="btn" href={`#/new/client/${c.id}`}>+ New proposal for {c.name}</a>
			</div>
			<div className="two-col">
				<section className="panel">
					<h2>Details</h2>
					<ClientForm
						key={c.id}
						initial={c}
						submitLabel="Save changes"
						onSave={async (input) => client.setData(await api.updateClient(c.id, input))}
					/>
					<div className="danger">
						{confirmDelete ? (
							<>
								<span>Delete {c.name}? Their proposals are kept.</span>
								<button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
								<button
									type="button"
									className="btn danger-btn"
									onClick={async () => {
										await api.deleteClient(c.id);
										location.hash = "#/clients";
									}}
								>
									Delete client
								</button>
							</>
						) : (
							<button type="button" className="link-btn muted" onClick={() => setConfirmDelete(true)}>Delete client</button>
						)}
					</div>
				</section>
				<section className="panel">
					<h2>Proposals</h2>
					{items.length > 0 && <p className="muted">Last activity {ago(items[0].updatedAt)}</p>}
					<ProposalTable items={items} empty={<>No proposals yet. <a href={`#/new/client/${c.id}`}>Write one</a>.</>} />
				</section>
			</div>
		</div>
	);
}
