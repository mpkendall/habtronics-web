import type { APIRoute } from 'astro';
import { validateCartItems, resolveStripeKey } from '../../lib/stripe';
export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = (context.locals as any)?.runtime?.env;
    const STRIPE_KEY = resolveStripeKey(runtimeEnv);
    const { request } = context;

    const { lineItems } = await request.json();

    if (!lineItems || lineItems.length === 0) {
      throw new Error('No line items provided');
    }

    const validatedLineItems = await validateCartItems(STRIPE_KEY, lineItems);

    const siteUrl = import.meta.env.PROD 
      ? (import.meta.env.SITE || 'https://www.habtronics.com') 
      : 'http://localhost:4321';

    const cleanSiteUrl = siteUrl.replace(/\/$/, '');

    const body = new URLSearchParams();
    body.append('ui_mode', 'embedded');
    body.append('mode', 'payment');
    body.append('return_url', `${cleanSiteUrl}/return?session_id={CHECKOUT_SESSION_ID}`);
    body.append('automatic_tax[enabled]', 'true');
    body.append('shipping_address_collection[allowed_countries][]', 'US');
    body.append('allow_promotion_codes', 'true');

    validatedLineItems.forEach((li, i) => {
      body.append(`line_items[${i}][price]`, li.price);
      body.append(`line_items[${i}][quantity]`, String(li.quantity));
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Stripe checkout.sessions.create error:', data);
      throw new Error(data.error?.message || 'Failed to create Stripe checkout session');
    }

    return new Response(JSON.stringify({ client_secret: data.client_secret }), {
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