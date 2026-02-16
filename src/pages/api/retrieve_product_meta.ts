import type { APIRoute } from 'astro';
import { getProductData, resolveStripeKey } from '../../lib/stripe';
export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = (context.locals as any)?.runtime?.env;
    const stripeKey = resolveStripeKey(runtimeEnv);
    const productMetadata = await getProductData(stripeKey);

    const safeProductMetadata = productMetadata.map((product: any) => {
      const { stock, ...safeMetadata } = product.metadata || {};
      return {
        ...product,
        metadata: safeMetadata,
      };
    });

    return new Response(JSON.stringify(safeProductMetadata), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error retrieving product metadata:', error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};

