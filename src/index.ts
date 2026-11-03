import { handle } from './app';
import type { Env, Store } from './env';
import { cacheRejections } from './rejections';

export { SigninStore } from './store';

export default {
	fetch(request, env) {
		if (!env.STORE) {
			throw new Error('STORE Durable Object binding missing');
		}
		// One instance for the whole service: every request must see the same codes.
		const store = env.STORE.get(env.STORE.idFromName('signin')) as unknown as Store;
		return handle(request, env, store, cacheRejections(caches.default, env.SITE_URL));
	},
} satisfies ExportedHandler<Env>;
