import { createClient } from "@supabase/supabase-js";

function resolveSupabaseUrl(runtimeEnv?: Record<string, unknown>): string {
	const url =
		runtimeEnv?.SUPABASE_URL as string | undefined
		?? (typeof process !== "undefined" ? (process.env as any).SUPABASE_URL : undefined)
		?? import.meta.env?.SUPABASE_URL;

	if (!url) {
		throw new Error("Missing SUPABASE_URL environment variable.");
	}

	return url;
}

function resolveSupabaseServiceKey(runtimeEnv?: Record<string, unknown>): string {
	const key =
		runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY as string | undefined
		?? (typeof process !== "undefined" ? (process.env as any).SUPABASE_SERVICE_ROLE_KEY : undefined)
		?? import.meta.env?.SUPABASE_SERVICE_ROLE_KEY;

	if (!key) {
		throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
	}

	return key;
}

export function getSupabaseServerClient(runtimeEnv?: Record<string, unknown>) {
	const supabaseUrl = resolveSupabaseUrl(runtimeEnv);
	const supabaseKey = resolveSupabaseServiceKey(runtimeEnv);

	return createClient(supabaseUrl, supabaseKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}