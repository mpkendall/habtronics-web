import Stripe from 'stripe';
import { getInventoryStock, getInventoryStockMap, getProductDataFromSupabase, reserveCheckoutItems } from './inventory';

// In-memory cache
let cachedProducts: any[] | null = null;
let lastFetched = 0;
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes
export const prerender = false;

export function invalidateProductCache() {
  cachedProducts = null;
  lastFetched = 0;
}

/**
 * Resolve the Stripe secret key.
 * On Cloudflare Pages the key lives in the runtime env bindings,
 * NOT in import.meta.env (which is only populated at build time
 * for non-PUBLIC_ vars). We try multiple sources so it works
 * everywhere: Cloudflare, Vercel, Node, and local dev.
 */
export function resolveStripeKey(runtimeEnv?: Record<string, unknown>): string {
  const key =
    runtimeEnv?.STRIPE_KEY as string | undefined   // Cloudflare runtime binding
    ?? (typeof process !== 'undefined' ? (process.env as any).STRIPE_KEY : undefined)  // Node / Vercel
    ?? import.meta.env?.STRIPE_KEY;                // Vite dev (.env file)

  if (!key) {
    throw new Error(
      'Missing STRIPE_KEY – make sure it is set as an env var / secret '
      + 'in your deployment platform AND in .env for local dev.'
    );
  }
  return key as string;
}

function createStripeClient(stripeKey: string) {
  return new Stripe(stripeKey, {
    apiVersion: '2026-04-22.dahlia',
  });
}

async function getBaseProductData(stripeKey: string) {
  const stripe = createStripeClient(stripeKey);
  const now = Date.now();

  // If cache is still valid, serve it
  if (cachedProducts && now - lastFetched < CACHE_TTL) {
    console.log('Serving cached product metadata...');
    return cachedProducts;
  }

  // Otherwise, fetch fresh from Stripe using the SDK.
  console.log('Fetching product metadata from Stripe (sdk)...');
  const productsResp = await stripe.products.list({
    limit: 100,
    expand: ['data.default_price'],
  });
  const products = productsResp?.data || [];

  const productMetadata = await Promise.all(
    products.map(async (product: any) => {
      let priceObj: any = product.default_price;

      if (typeof product.default_price === 'string') {
        priceObj = await stripe.prices.retrieve(product.default_price);
      }

      return {
        id: product.id,
        name: product.name,
        price_id: priceObj?.id,
        price: (((priceObj?.unit_amount ?? 0) as number) / 100).toFixed(2),
        image: product.images?.[0] ?? null,
        image_array: product.images ?? [],
        metadata: product.metadata ?? {},
      };
    })
  );

  // Sort products by numeric metadata field `sort_order` or `order` when present.
  // Lower numbers appear first. If neither field is present, fall back to name.
  productMetadata.sort((a: any, b: any) => {
    const ao = Number(a.metadata?.rank ?? NaN);
    const bo = Number(b.metadata?.rank ?? NaN);
    const aoValid = !Number.isNaN(ao);
    const boValid = !Number.isNaN(bo);
    if (aoValid && boValid) return ao - bo;
    if (aoValid) return -1;
    if (boValid) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Update cache
  cachedProducts = productMetadata;
  lastFetched = now;

  return productMetadata;
}

export async function getProductData(stripeKey: string, runtimeEnv?: Record<string, unknown>) {
  console.log('Fetching products from Supabase...');
  const supabaseProducts = await getProductDataFromSupabase(runtimeEnv);
  const stripe = createStripeClient(stripeKey);

  return Promise.all(
    supabaseProducts.map(async (product: any) => {
      try {
        const price = await stripe.prices.retrieve(product.price_id);
        return {
          ...product,
          name: product.metadata.title,
          price: (((price.unit_amount ?? 0) as number) / 100).toFixed(2),
        };
      } catch (err) {
        console.error(`Failed to fetch price for ${product.price_id}:`, err);
        return {
          ...product,
          name: product.metadata.title,
          price: '0.00',
        };
      }
    })
  );
}

export async function validateCartItems(
  stripeKey: string,
  clientItems: { priceId: string; quantity: number }[],
  runtimeEnv?: Record<string, unknown>
) {
  // Validate input structure
  if (!Array.isArray(clientItems) || clientItems.length === 0) {
    throw new Error('Invalid cart items');
  }

  const reservation = await reserveCheckoutItems(runtimeEnv, clientItems);

  return reservation;
}
