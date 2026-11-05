import { handle } from './app';
import { type Archive, archiveUsage } from './archive';
import type { Env, Store } from './env';
import { cacheRejections } from './rejections';
import { sqlApi } from './report';

export { SigninStore } from './store';

/** One instance for the whole service: every request must see the same codes. */
function signinStore(env: Env): Store & Archive {
	if (!env.STORE) {
		throw new Error('STORE Durable Object binding missing');
	}
	return env.STORE.get(env.STORE.idFromName('signin')) as unknown as Store & Archive;
}

export default {
	fetch(request, env) {
		const store = signinStore(env);
		return handle(request, env, store, cacheRejections(caches.default, env.SITE_URL), store);
	},

	// Hourly (wrangler.jsonc): copies finished days of usage counts from Analytics Engine into the archive.
	async scheduled(controller, env) {
		if (!env.ANALYTICS_ACCOUNT_ID || !env.USAGE_API_TOKEN) {
			return;
		}
		const days = await archiveUsage(sqlApi(env.ANALYTICS_ACCOUNT_ID, env.USAGE_API_TOKEN), signinStore(env), new Date(controller.scheduledTime));
		if (days.length) {
			console.log(`Usage archived: ${days.join(', ')}`);
		}
	},
} satisfies ExportedHandler<Env>;
