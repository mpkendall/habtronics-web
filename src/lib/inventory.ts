import { supabase } from "../db/supabase.js";
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

type ReservedCheckoutItem = {
	price: string;
	quantity: number;
	title: string;
};

function normalizeSlug(slug: string | null | undefined) {
	return (slug || "").trim().toLowerCase();
}

export async function getProductsFromSupabase() {
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

export async function getProductDataFromSupabase() {
	const products = await getProductsFromSupabase();

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

export async function getInventoryStockMap(slugs: string[]) {
	const normalizedSlugs = Array.from(new Set(slugs.map(normalizeSlug).filter(Boolean)));
	const stockMap = new Map<string, number>();

	if (normalizedSlugs.length === 0) {
		return stockMap;
	}

	const products = await getProductsFromSupabase();
	for (const product of products) {
		const slug = normalizeSlug(product.slug);
		if (normalizedSlugs.includes(slug)) {
			const stock = Number(product.stock ?? 0);
			stockMap.set(slug, Number.isFinite(stock) ? stock : 0);
		}
	}

	return stockMap;
}

export async function getInventoryStock(slug: string, fallbackStock = 0) {
	const stockMap = await getInventoryStockMap([slug]);
	return stockMap.get(normalizeSlug(slug)) ?? fallbackStock;
}

export async function reserveCheckoutItems(runtimeEnv: Record<string, unknown> | undefined, clientItems: CheckoutItem[]) {
	const supabaseServer = getSupabaseServerClient(runtimeEnv);
	const normalizedItems = clientItems.map((item) => ({
		price_id: item.priceId,
		quantity: item.quantity,
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

	const products = await getProductsFromSupabase();
	const productByPriceId = new Map(products.map((product) => [product.price_id, product]));

	const lineItems: ReservedCheckoutItem[] = normalizedItems.map((item) => {
		const product = productByPriceId.get(item.price_id);
		if (!product) {
			throw new Error(`Product with price ID ${item.price_id} not found.`);
		}

		return {
			price: item.price_id,
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