import { handle } from './app';
import type { Env, Store } from './env';

export { SigninStore } from './store';

export default {
	fetch(request, env) {
		if (!env.STORE) {
			throw new Error('STORE Durable Object binding missing');
		}
		// One instance for the whole service: every request must see the same codes.
		const store = env.STORE.get(env.STORE.idFromName('signin')) as unknown as Store;
		return handle(request, env, store);
	},
} satisfies ExportedHandler<Env>;
