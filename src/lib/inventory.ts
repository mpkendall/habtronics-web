import { getSupabaseClient } from "../db/supabase.js";
import { getSupabaseServerClient } from "../db/supabase-server.js";

type ProductRow = {
	slug: string;
	title: string;
	price_id: string;
	image: string;
	stock: number | string | null;
	metadata?: Record<string, any>;
};

type CheckoutItem = {
	priceId: string;
	quantity: number;
};

type ProductVariant = {
	name?: string;
	priceId?: string;
	stock?: number | string | null;
};

type ReservedCheckoutItem = {
	price: string;
	quantity: number;
	title: string;
};

function normalizeSlug(slug: string | null | undefined) {
	return (slug || "").trim().toLowerCase();
}

export async function getProductsFromSupabase(runtimeEnv?: Record<string, unknown>) {
	const supabase = getSupabaseClient(runtimeEnv);
	const { data, error } = await supabase
		.from("products")
		.select("*")
		.order("slug", { ascending: true });

	if (error) {
		console.error("Error loading products from Supabase:", error.message);
		return [];
	}

	return (data ?? []) as ProductRow[];
}

export async function getProductDataFromSupabase(runtimeEnv?: Record<string, unknown>) {
	const products = await getProductsFromSupabase(runtimeEnv);

	return products.map((product: ProductRow) => ({
		id: product.slug,
		price_id: product.price_id,
		image: product.image,
		image_array: [product.image],
		metadata: {
			short: product.slug,
			title: product.title,
			stock: Number(product.stock ?? 0),
			...(product.metadata ?? {}),
		},
	}));
}

export async function getInventoryStockMap(slugs: string[], runtimeEnv?: Record<string, unknown>) {
	const normalizedSlugs = Array.from(new Set(slugs.map(normalizeSlug).filter(Boolean)));
	const stockMap = new Map<string, number>();

	if (normalizedSlugs.length === 0) {
		return stockMap;
	}

	const products = await getProductsFromSupabase(runtimeEnv);
	for (const product of products) {
		const slug = normalizeSlug(product.slug);
		if (normalizedSlugs.includes(slug)) {
			const stock = Number(product.stock ?? 0);
			stockMap.set(slug, Number.isFinite(stock) ? stock : 0);
		}
	}

	return stockMap;
}

export async function getInventoryStock(slug: string, fallbackStock = 0, runtimeEnv?: Record<string, unknown>) {
	const stockMap = await getInventoryStockMap([slug], runtimeEnv);
	return stockMap.get(normalizeSlug(slug)) ?? fallbackStock;
}

export async function reserveCheckoutItems(runtimeEnv: Record<string, unknown> | undefined, clientItems: CheckoutItem[]) {
	const supabaseServer = getSupabaseServerClient(runtimeEnv);

	const products = await getProductsFromSupabase(runtimeEnv);
	const productByPriceId = new Map<string, { title: string; reservationPriceId: string }>();

	for (const product of products) {
		productByPriceId.set(product.price_id, {
			title: product.title,
			reservationPriceId: product.price_id,
		});

		const variants = Array.isArray(product.metadata?.variants)
			? (product.metadata.variants as ProductVariant[])
			: [];

		for (const variant of variants) {
			if (!variant?.priceId) {
				continue;
			}

			productByPriceId.set(variant.priceId, {
				title: variant.name ? `${product.title} - ${variant.name}` : product.title,
				reservationPriceId: product.price_id,
			});
		}
	}

	const reservationItems = new Map<string, number>();
	for (const item of clientItems) {
		const product = productByPriceId.get(item.priceId);
		if (!product) {
			throw new Error(`Product with price ID ${item.priceId} not found.`);
		}

		reservationItems.set(
			product.reservationPriceId,
			(reservationItems.get(product.reservationPriceId) ?? 0) + item.quantity,
		);
	}

	const normalizedItems = Array.from(reservationItems.entries()).map(([priceId, quantity]) => ({
		price_id: priceId,
		quantity,
	}));

	const { data, error } = await supabaseServer.rpc("reserve_inventory", {
		p_items: normalizedItems,
	});

	if (error) {
		throw new Error(error.message);
	}

	const reservationId = data as string;
	if (!reservationId) {
		throw new Error("Unable to reserve inventory.");
	}

	const lineItems: ReservedCheckoutItem[] = clientItems.map((item) => {
		const product = productByPriceId.get(item.priceId);
		if (!product) {
			throw new Error(`Product with price ID ${item.priceId} not found.`);
		}

		return {
			price: item.priceId,
			quantity: item.quantity,
			title: product.title,
		};
	});

	return {
		reservationId,
		lineItems,
	};
}

export async function releaseInventoryReservation(runtimeEnv: Record<string, unknown> | undefined, reservationId: string) {
	const supabaseServer = getSupabaseServerClient(runtimeEnv);
	const { error } = await supabaseServer.rpc("release_inventory_reservation", {
		p_reservation_id: reservationId,
	});

	if (error) {
		throw new Error(error.message);
	}
}

export async function commitInventoryReservation(runtimeEnv: Record<string, unknown> | undefined, reservationId: string) {
	const supabaseServer = getSupabaseServerClient(runtimeEnv);
	const { error } = await supabaseServer.rpc("commit_inventory_reservation", {
		p_reservation_id: reservationId,
	});

	if (error) {
		throw new Error(error.message);
	}
}