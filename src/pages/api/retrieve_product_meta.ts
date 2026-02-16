import type { APIRoute } from 'astro';
import { getProductData } from '../../lib/stripe';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  console.log('=== API Route Started ===');
  console.log('Environment variables:', Object.keys(context.env || {}));
  
  try {
    // Access the Stripe key from context.env, not import.meta.env
    if (!context.env.STRIPE_KEY) {
      console.error('STRIPE_KEY not found in environment variables');
      return new Response(
        JSON.stringify({ error: 'STRIPE_KEY is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const productMetadata = await getProductData(context.env.STRIPE_KEY);

    const safeProductMetadata = productMetadata.map((product: any) => {
      const { stock, ...safeMetadata } = product.metadata || {};
      return {
        ...product,
        metadata: safeMetadata,
      };
    });

    console.log('Returning products:', safeProductMetadata.length);
    return new Response(JSON.stringify(safeProductMetadata), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('=== ERROR ===');
    console.error('Error message:', (error as Error)?.message);
    
    return new Response(JSON.stringify({ 
      error: (error as Error)?.message,
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
