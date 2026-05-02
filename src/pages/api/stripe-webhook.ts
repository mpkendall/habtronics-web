import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { commitInventoryReservation, releaseInventoryReservation } from '../../lib/inventory';
import { commitCustomerEntry } from '../../lib/customers';

export const prerender = false;

function resolveWebhookSecret(runtimeEnv?: Record<string, unknown>): string {
	const secret =
		runtimeEnv?.STRIPE_WEBHOOK_SECRET as string | undefined
		?? (typeof process !== 'undefined' ? (process.env as any).STRIPE_WEBHOOK_SECRET : undefined)
		?? import.meta.env?.STRIPE_WEBHOOK_SECRET;

	if (!secret) {
		throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable.');
	}

	return secret;
}

export const POST: APIRoute = async (context) => {
	const runtimeEnv = (context.locals as any)?.runtime?.env;
	const stripeKey = (typeof process !== 'undefined' ? (process.env as any).STRIPE_KEY : undefined) ?? import.meta.env?.STRIPE_KEY ?? runtimeEnv?.STRIPE_KEY;

	if (!stripeKey) {
		return new Response(JSON.stringify({ error: 'Missing STRIPE_KEY' }), { status: 500 });
	}

	const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });
	const signature = context.request.headers.get('stripe-signature');
	const webhookSecret = resolveWebhookSecret(runtimeEnv);
	const payload = new TextDecoder().decode(await context.request.arrayBuffer());

	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(payload, signature || '', webhookSecret);
	} catch (error: any) {
		return new Response(JSON.stringify({ error: error?.message || 'Invalid signature' }), { status: 400 });
	}

	try {
		if (event.type === 'checkout.session.completed') {
			const session = event.data.object as Stripe.Checkout.Session;
			const reservationId = session.metadata?.reservation_id;
			if (reservationId) {
				await commitInventoryReservation(runtimeEnv, reservationId);
			}
			const customerEntry = {
				name: session.customer_details?.name ?? 'Unknown',
				email: session.customer_details?.email ?? 'Unknown',
				consent: session.customer_details?.email ? true : false,
				stripe_id: session.id,
				stripe_date: new Date().toISOString(),
			};
			await commitCustomerEntry(runtimeEnv, customerEntry);
		}

		if (event.type === 'checkout.session.expired') {
			const session = event.data.object as Stripe.Checkout.Session;
			const reservationId = session.metadata?.reservation_id;
			if (reservationId) {
				await releaseInventoryReservation(runtimeEnv, reservationId);
			}
		}

		return new Response(JSON.stringify({ received: true }), { status: 200 });
	} catch (error: any) {
		console.error('Webhook processing failed:', error?.message || error);
		return new Response(JSON.stringify({ error: error?.message || 'Webhook error' }), { status: 500 });
	}
};