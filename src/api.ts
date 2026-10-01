import { authHeader, hosted } from "./auth";
import type { Client, ClientInput, Length, Model, Profile, ProfileInput, Status, StoredProposal } from "./proposal";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`/api/${path}`, {
		method,
		headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(await authHeader()) },
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await res.json().catch(() => {
		throw new Error(hosted ? "Couldn't reach QuickPitch. Check your connection and try again." : "QuickPitch's local server isn't running. Start it with `npm run dev`.");
	});
	if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
	return data as T;
}

export type ProfileSummary = Pick<Profile, "id" | "name" | "company" | "accent">;

export const api = {
	profiles: () => call<ProfileSummary[]>("GET", "profiles"),
	profile: (id: string) => call<Profile>("GET", `profiles/${id}`),
	createProfile: (p: ProfileInput) => call<Profile>("POST", "profiles", p),
	updateProfile: (id: string, p: ProfileInput) => call<Profile>("PUT", `profiles/${id}`, p),
	proposals: (profileId: string) =>
		call<StoredProposal[]>("GET", `proposals?profileId=${encodeURIComponent(profileId)}`),
	proposal: (id: string) => call<StoredProposal>("GET", `proposals/${id}`),
	deleteProposal: (id: string) => call<{ ok: true }>("DELETE", `proposals/${id}`, {}),
	saveEdit: (id: string, html: string) => call<StoredProposal>("POST", `proposals/${id}/versions`, { html }),
	revise: (id: string, instruction: string, model: Model) => call<StoredProposal>("POST", `proposals/${id}/revise`, { instruction, model }),
	restore: (id: string, version: number) => call<StoredProposal>("POST", `proposals/${id}/restore`, { version }),
	writeMessage: (id: string) => call<StoredProposal>("POST", `proposals/${id}/message`, {}),
	saveMessage: (id: string, message: string) => call<StoredProposal>("PUT", `proposals/${id}/message`, { message }),
	// Returns the PDF file; errors come back as JSON.
	pdf: async (html: string) => {
		const res = await fetch("/api/pdf", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ html }) });
		if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "PDF export failed");
		return res.blob();
	},
	setStatus: (id: string, status: Status) => call<StoredProposal>("PATCH", `proposals/${id}`, { status }),
	clients: (profileId: string) => call<Client[]>("GET", `clients?profileId=${encodeURIComponent(profileId)}`),
	client: (id: string) => call<Client>("GET", `clients/${id}`),
	createClient: (profileId: string, c: ClientInput) => call<Client>("POST", "clients", { profileId, ...c }),
	updateClient: (id: string, c: ClientInput) => call<Client>("PUT", `clients/${id}`, c),
	deleteClient: (id: string) => call<{ ok: true }>("DELETE", `clients/${id}`, {}),
	findLogo: (url: string) => call<{ dataUrl: string; source: string }>("GET", `logo?url=${encodeURIComponent(url)}`),
	generate: (b: { profileId: string; clientId?: string; proposalId?: string; notes: string; transcript: string; transcriptName: string; length: Length; model: Model; productImage: boolean }) =>
		call<StoredProposal>("POST", "generate", b),
};
