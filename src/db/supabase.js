import { createClient } from "@supabase/supabase-js";

function resolveSupabaseUrl(runtimeEnv) {
	const url =
		runtimeEnv?.SUPABASE_URL
		?? (typeof process !== "undefined" ? process.env?.SUPABASE_URL : undefined)
		?? import.meta.env?.SUPABASE_URL;

	if (!url) {
		throw new Error("Missing SUPABASE_URL environment variable.");
	}

	return url;
}

function resolveSupabaseKey(runtimeEnv) {
	const key =
		runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY
		?? runtimeEnv?.SUPABASE_KEY
		?? runtimeEnv?.SUPABASE_ANON_KEY
		?? runtimeEnv?.SUPABASE_PUBLISHABLE_KEY
		?? (typeof process !== "undefined" ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined)
		?? (typeof process !== "undefined" ? process.env?.SUPABASE_KEY : undefined)
		?? (typeof process !== "undefined" ? process.env?.SUPABASE_ANON_KEY : undefined)
		?? (typeof process !== "undefined" ? process.env?.SUPABASE_PUBLISHABLE_KEY : undefined)
		?? import.meta.env?.SUPABASE_SERVICE_ROLE_KEY
		?? import.meta.env?.SUPABASE_KEY
		?? import.meta.env?.SUPABASE_ANON_KEY
		?? import.meta.env?.SUPABASE_PUBLISHABLE_KEY;

	if (!key) {
		throw new Error("Missing Supabase key environment variable.");
	}

	return key;
}

export function getSupabaseClient(runtimeEnv) {
	const supabaseUrl = resolveSupabaseUrl(runtimeEnv);
	const supabaseKey = resolveSupabaseKey(runtimeEnv);

	return createClient(supabaseUrl, supabaseKey);
}