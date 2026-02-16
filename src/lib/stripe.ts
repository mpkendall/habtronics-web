import Stripe from 'stripe';

// Remove the global stripe instance
// const stripe = new Stripe(import.meta.env.STRIPE_KEY); // ❌ Don't do this

let cachedProducts: any[] | null = null;
let lastFetched = 0;
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

export async function getProductData(stripeKey: string) {
  const now = Date.now();

  // If cache is still valid, serve it
  if (cachedProducts && now - lastFetched < CACHE_TTL) {
    console.log('Serving cached product metadata...');
    return cachedProducts;
  }

  // Create Stripe client with the provided key
  const stripe = new Stripe(stripeKey);

  // Otherwise, fetch fresh from Stripe
  console.log('Fetching product metadata from Stripe...');
  const products = await stripe.products.list();

  const productMetadata = await Promise.all(
    products.data.map(async (product) => {
      const priceObj = typeof product.default_price === 'string'
        ? await stripe.prices.retrieve(product.default_price)
        : product.default_price;

      return {
        id: product.id,
        name: product.name,
        price_id: priceObj?.id,
        price: (( (priceObj as any)?.unit_amount || 0) / 100).toFixed(2),
        image: product.images[0],
        image_array: product.images,
        metadata: product.metadata,
      };
    })
  );

  // Update cache
  cachedProducts = productMetadata;
  lastFetched = now;

  return productMetadata;
}
