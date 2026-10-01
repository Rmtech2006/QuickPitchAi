import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { ProposalDoc } from "./ProposalDoc";
import { type Client, costLabel, type Model, MODELS, type Profile, STATUSES, type Status } from "./proposal";
import { ago, useLoad } from "./ui";

// Safety net for designs that run long: lay the page out taller, then zoom it back to exactly A4,
// so nothing is cut off on screen or in the PDF.
function fitPages(doc: Document) {
	for (const page of doc.querySelectorAll<HTMLElement>(".page")) {
		unfit(page);
		const over = page.scrollHeight / page.clientHeight;
		if (!(over > 1.005)) continue;
		const z = 1 / over;
		page.style.zoom = String(z);
		page.style.width = `calc(210mm / ${z})`;
		page.style.height = `calc(297mm / ${z})`;
	}
}
function unfit(page: HTMLElement) {
	page.style.zoom = "";
	page.style.width = "";
	page.style.height = "";
}
const serialize = (doc: Document) => `<!doctype html>\n${doc.documentElement.outerHTML}`;

const fileName = (s: string) => `${s.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim()}.pdf`;

// Indian numbers are often saved without the country code.
function whatsappLink(phone: string, text: string) {
	let digits = phone.replace(/\D/g, "");
	if (digits.length === 10) digits = `91${digits}`;
	return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function ProposalPage({ id, profile }: { id: string; profile: Profile }) {
	const item = useLoad(() => api.proposal(id), [id]);
	const p = item.data;
	const client = useLoad<Client | null>(() => (p?.clientId ? api.client(p.clientId).catch(() => null) : Promise.resolve(null)), [p?.clientId]);
	const frame = useRef<HTMLIFrameElement>(null);
	const canvas = useRef<HTMLDivElement>(null);
	const [viewing, setViewing] = useState<number | null>(null);
	const [editing, setEditing] = useState(false);
	const [busy, setBusy] = useState<"" | "pdf" | "save" | "revise" | "restore" | "message">("");
	const [note, setNote] = useState<{ ok: boolean; text: string }>();
	const [instruction, setInstruction] = useState("");
	const [model, setModel] = useState<Model>("opus");
	const [message, setMessage] = useState("");
	const [copied, setCopied] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => setMessage(p?.message ?? ""), [p?.message]);

	// Shrink the on-screen A4 preview to fit the column (the PDF is unaffected).
	useEffect(() => {
		const el = canvas.current;
		if (!el) return;
		const scale = () => {
			const f = frame.current;
			if (f) f.style.zoom = String(Math.min(1, el.clientWidth / (210 * 96 / 25.4)));
		};
		scale();
		const ro = new ResizeObserver(scale);
		ro.observe(el);
		return () => ro.disconnect();
	});

	if (item.error || (p && p.profileId !== profile.id))
		return <div className="page"><p className="error">Proposal not found.</p></div>;
	if (!p) return null;

	const versions = p.versions ?? [];
	const current = versions.length - 1;
	const shown = viewing !== null && viewing !== current ? versions[viewing] : null;
	const html = shown?.html ?? p.html;

	const doc = () => frame.current?.contentDocument ?? null;
	// Grow the frame to the page's full height, so the proposal scrolls with the app.
	const fitFrame = () => {
		const d = doc();
		if (!d || !frame.current) return;
		fitPages(d);
		frame.current.style.height = `${d.documentElement.scrollHeight}px`;
		// Web fonts can change text height after load: fit again once they're in.
		d.fonts?.ready.then(() => {
			fitPages(d);
			if (frame.current) frame.current.style.height = `${d.documentElement.scrollHeight}px`;
		});
	};
	const fail = (e: unknown) => setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
	const update = (next: typeof p) => {
		item.setData(next);
		setViewing(null);
	};

	async function setStatus(status: Status) {
		item.setData({ ...p!, ...(await api.setStatus(id, status)) });
	}

	async function downloadPdf() {
		const d = doc();
		if (!d) return window.print(); // older text-only proposals
		setBusy("pdf");
		setNote(undefined);
		try {
			const blob = await api.pdf(serialize(d)); // already fitted to A4, exactly as shown
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = fileName(`${p!.client ? `${p!.client} - ` : ""}${p!.title}${p!.reference ? ` (${p!.reference})` : ""}`);
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
		} catch (e) {
			fail(e);
		} finally {
			setBusy("");
		}
	}

	function startEditing() {
		const d = doc();
		if (!d) return;
		d.designMode = "on";
		setEditing(true);
		setNote({ ok: true, text: "Click any text on the page to change it, then save." });
	}
	async function saveEditing() {
		const d = doc();
		if (!d) return;
		setBusy("save");
		try {
			d.designMode = "off";
			for (const page of d.querySelectorAll<HTMLElement>(".page")) unfit(page); // save the design, not the on-screen fit
			update(await api.saveEdit(id, serialize(d)));
			setEditing(false);
			setNote({ ok: true, text: "Saved as a new version." });
		} catch (e) {
			fail(e);
		} finally {
			setBusy("");
		}
	}
	function cancelEditing() {
		setEditing(false);
		setNote(undefined);
		if (frame.current) frame.current.srcdoc = html ?? ""; // throw away unsaved changes
	}

	async function revise() {
		setBusy("revise");
		setNote(undefined);
		try {
			update(await api.revise(id, instruction.trim(), model));
			setInstruction("");
			setNote({ ok: true, text: "Revised. The previous version is kept below." });
		} catch (e) {
			fail(e);
		} finally {
			setBusy("");
		}
	}

	async function restore(n: number) {
		setBusy("restore");
		try {
			update(await api.restore(id, n));
			setNote({ ok: true, text: `Restored v${n + 1} as the latest version.` });
		} catch (e) {
			fail(e);
		} finally {
			setBusy("");
		}
	}

	async function writeMessage() {
		setBusy("message");
		try {
			const next = await api.writeMessage(id);
			item.setData({ ...p!, message: next.message });
		} catch (e) {
			fail(e);
		} finally {
			setBusy("");
		}
	}

	const saveMessage = () => {
		if (message !== (p.message ?? "")) api.saveMessage(id, message).then((next) => item.setData({ ...p, message: next.message }), fail);
	};
	const copy = async () => {
		await navigator.clipboard.writeText(message);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};
	const c = client.data;
	const mail = `mailto:${c?.email ?? ""}?subject=${encodeURIComponent(p.title)}&body=${encodeURIComponent(message)}`;

	return (
		<div className="page wide">
			<div className="toolbar no-print">
				<a href="#/proposals">← Proposals</a>
				<label className="row">
					Status
					<select value={p.status} onChange={(e) => setStatus(e.target.value as Status)}>
						{STATUSES.map((s) => <option key={s}>{s}</option>)}
					</select>
				</label>
				<button type="button" className="btn" disabled={busy === "pdf" || editing} onClick={downloadPdf}>
					{busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
				</button>
			</div>
			{note && <p className={note.ok ? "banner" : "banner error"} role="status">{note.text}</p>}

			<div className="proposal-layout">
				<div className="proposal-canvas" ref={canvas}>
					{shown && (
						<p className="banner viewing">
							Viewing v{(viewing ?? 0) + 1}: {shown.label}.
							<button type="button" className="btn" disabled={busy === "restore"} onClick={() => restore(viewing ?? 0)}>Restore this version</button>
							<button type="button" className="btn ghost" onClick={() => setViewing(null)}>Back to latest</button>
						</p>
					)}
					{html ? (
						<iframe
							key={html.length + (viewing ?? -1)}
							ref={frame}
							aria-label={p.title}
							className={`designed${editing ? " editing" : ""}`}
							srcDoc={html}
							// No allow-scripts: the page comes from web research, so it may never run code.
							sandbox="allow-same-origin allow-modals"
							onLoad={fitFrame}
						/>
					) : (
						p.proposal && (
							<div style={{ "--accent": profile.accent } as React.CSSProperties}>
								<ProposalDoc p={p.proposal} company={profile.company} />
							</div>
						)
					)}
				</div>

				<aside className="proposal-side no-print">
					{p.html && !shown && (
						<section className="panel">
							<h2>Edit</h2>
							{editing ? (
								<div className="row-gap">
									<button type="button" className="btn" disabled={busy === "save"} onClick={saveEditing}>{busy === "save" ? "Saving…" : "Save changes"}</button>
									<button type="button" className="btn ghost" onClick={cancelEditing}>Cancel</button>
								</div>
							) : (
								<>
									<p className="muted small">Fix a name, price or line by typing on the page.</p>
									<button type="button" className="btn ghost" onClick={startEditing}>Edit text on the page</button>
								</>
							)}
							<hr />
							<label>
								Ask for a change
								<textarea
									rows={3}
									value={instruction}
									onChange={(e) => setInstruction(e.target.value)}
									placeholder="Describe what to change"
									disabled={busy === "revise" || editing}
								/>
							</label>
							<div className="row-gap">
								<select value={model} onChange={(e) => setModel(e.target.value as Model)} aria-label="Writing model" className="compact">
									{Object.entries(MODELS).map(([mid, name]) => <option key={mid} value={mid}>{name}</option>)}
								</select>
								<button type="button" className="btn" disabled={!instruction.trim() || busy === "revise" || editing} onClick={revise}>
									{busy === "revise" ? "Revising…" : "Revise"}
								</button>
							</div>
							{busy === "revise" && <p className="muted small">Keeping the design and changing only what you asked. Usually under a minute.</p>}
						</section>
					)}

					<section className="panel">
						<h2>Send</h2>
						<p className="muted small">Download the PDF, then send it with this note.</p>
						{!message && p.html && (
							<button type="button" className="btn ghost" disabled={busy === "message"} onClick={writeMessage}>
								{busy === "message" ? "Writing…" : "Write the message for me"}
							</button>
						)}
						<textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} onBlur={saveMessage} placeholder="A short note to send with the PDF" aria-label="Message to the client" />
						<div className="row-gap">
							<button type="button" className="btn ghost" disabled={!message} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
							<a className="btn ghost" href={whatsappLink(c?.phone ?? "", message)} target="_blank" rel="noreferrer">WhatsApp</a>
							<a className="btn ghost" href={mail}>Email</a>
						</div>
						{p.status === "Draft" && (
							<button type="button" className="link-btn" onClick={() => setStatus("Sent")}>Mark as sent</button>
						)}
					</section>

					{versions.length > 0 && (
						<section className="panel">
							<h2>Versions</h2>
							<ol className="versions">
								{versions.map((_, i) => i).reverse().map((i) => (
									<li key={versions[i].createdAt + i} className={(viewing ?? current) === i ? "active" : ""}>
										<button type="button" onClick={() => setViewing(i === current ? null : i)} disabled={editing}>
											<strong>v{i + 1}</strong> {versions[i].label}
											<small className="muted block">{ago(versions[i].createdAt)}{i === current ? " · latest" : ""}</small>
											{versions[i].cost && <small className="muted block">{costLabel(versions[i].cost!)}</small>}
										</button>
									</li>
								))}
							</ol>
							<small className="muted">Costs come out of your Claude plan's usage, not a separate bill.</small>
							<a className="link-btn muted" href={`#/new/${p.id}`}>Regenerate from notes</a>
						</section>
					)}

					<div className="danger">
						{confirmDelete ? (
							<>
								<span>Delete this proposal and all its versions?</span>
								<button type="button" className="btn danger-btn" onClick={() => api.deleteProposal(p.id).then(() => (location.hash = "#/proposals"))}>Delete</button>
								<button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
							</>
						) : (
							<button type="button" className="link-btn muted" onClick={() => setConfirmDelete(true)}>Delete proposal</button>
						)}
					</div>
				</aside>
			</div>
		</div>
	);
}
