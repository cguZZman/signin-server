import type { Rejections } from './env';
import { REJECTION_LIFETIME_MS, type Rejection } from './state';

/**
 * Refresh tokens the provider refused, kept in the data center's cache (Cache API) instead of the store: they are
 * most refreshes, and every request to the Durable Object counts against its daily free requests. Each data center
 * keeps its own copy, so the provider may be asked about a token once a day in each one.
 */
export function cacheRejections(cache: Cache, siteUrl: string): Rejections {
	// Only this Worker reads the cache: requests to the site reach the Worker, never these entries.
	const url = (key: string) => `${new URL(siteUrl).origin}/.rejections/${encodeURIComponent(key)}`;
	return {
		async reject(key: string, rejection: Rejection) {
			const headers = { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${REJECTION_LIFETIME_MS / 1000}` };
			await cache.put(url(key), new Response(JSON.stringify(rejection), { headers }));
		},
		async rejection(key: string) {
			const cached = await cache.match(url(key));
			return cached ? ((await cached.json()) as Rejection) : null;
		},
	};
}
