import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { validateCartItems, resolveStripeKey } from '../../lib/stripe';
export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = (context.locals as any)?.runtime?.env;
    const STRIPE_KEY = resolveStripeKey(runtimeEnv);
    const stripe = new Stripe(STRIPE_KEY, {
      apiVersion: '2026-04-22.dahlia',
    });
    const { request } = context;

    const { lineItems } = await request.json();

    if (!lineItems || lineItems.length === 0) {
      throw new Error('No line items provided');
    }

    const { reservationId, lineItems: reservedLineItems } = await validateCartItems(STRIPE_KEY, lineItems, runtimeEnv);

    const siteUrl = import.meta.env.PROD 
      ? (import.meta.env.SITE || 'https://www.habtronics.com') 
      : 'http://localhost:4321';

    const cleanSiteUrl = siteUrl.replace(/\/$/, '');

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      payment_intent_data: {
        description: "Join our Discord server for additional support and updates: https://discord.gg/yNX8mAnTEy",
      },
      return_url: `${cleanSiteUrl}/return?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        reservation_id: reservationId,
      },
      client_reference_id: reservationId,
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: ['US'] },
      allow_promotion_codes: true,
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 589,
              currency: 'usd',
            },
            display_name: 'USPS Ground Advantage',
            delivery_estimate: {
              minimum: {
                unit: 'business_day',
                value: 5,
              },
              maximum: {
                unit: 'business_day',
                value: 7,
              }
            }
          }
        }
      ],
      consent_collection: {
        promotions: 'auto',
      },
      line_items: reservedLineItems.map((li) => ({
        price: li.price,
        quantity: li.quantity,
      })),
    });

    return new Response(JSON.stringify({ client_secret: session.client_secret }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error?.message || error);
    const statusCode = (error?.message || '').toLowerCase().includes('stock') ? 409 : 500;
    return new Response(JSON.stringify({ error: error?.message || 'Internal error' }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};