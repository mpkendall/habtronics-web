import { getSupabaseServerClient } from "../db/supabase-server.js";

type CustomerEntry = {
    name: string;
    email: string;
    consent: boolean;
    stripe_id: string;
    stripe_date: string;
}

export async function commitCustomerEntry(
    runtimeEnv: Record<string, unknown> | undefined,
    customerEntry: CustomerEntry
): Promise<void> {
    const supabaseServer = getSupabaseServerClient(runtimeEnv);
    const { error } = await supabaseServer.from('customers').insert({
        name: customerEntry.name,
        email: customerEntry.email,
        consent: customerEntry.consent,
        stripe_id: customerEntry.stripe_id,
        stripe_date: customerEntry.stripe_date
    }).select().single();

    if (error) {
        console.error('Error inserting customer entry:', error.message);
        throw new Error('Failed to record customer entry');
    }
}