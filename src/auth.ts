import { createClient } from "@supabase/supabase-js";

// Hosted build only: log in with an emailed link. The local app has no login (it runs on your own machine).
export const hosted = import.meta.env.PROD;

// Created only when configured, so a missing setting can't take the marketing site down with it.
export const supabase = hosted && import.meta.env.VITE_SUPABASE_URL
	? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { flowType: "pkce" } })
	: null;

export async function authHeader(): Promise<Record<string, string>> {
	const token = (await supabase?.auth.getSession())?.data.session?.access_token;
	return token ? { Authorization: `Bearer ${token}` } : {};
}
