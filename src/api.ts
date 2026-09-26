import type { Length, Model, Profile, ProfileInput, Status, StoredProposal } from "./proposal";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`/api/${path}`, {
		method,
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await res.json();
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
	setStatus: (id: string, status: Status) => call<StoredProposal>("PATCH", `proposals/${id}`, { status }),
	generate: (b: { profileId: string; notes: string; length: Length; model: Model }) =>
		call<StoredProposal>("POST", "generate", b),
};
