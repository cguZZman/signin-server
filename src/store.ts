import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { type Limit, SigninState, type Tokens } from './state';

/**
 * The single instance holding the sign-in codes and rate-limit counters, in memory only. Kodi polls every
 * few seconds during a sign-in, which keeps the object in memory for as long as a code lives.
 */
export class SigninStore extends DurableObject<Env> {
	private readonly state = new SigninState();

	createPin(provider: string, owner: string) {
		return this.state.createPin(provider, owner);
	}

	startSignin(pin: string, client: string) {
		return this.state.startSignin(pin, client);
	}

	finishSignin(pin: string, browserNonce: string | null) {
		return this.state.finishSignin(pin, browserNonce);
	}

	storeTokens(pin: string, tokens: Tokens) {
		return this.state.storeTokens(pin, tokens);
	}

	collect(pin: string, password: string, client: string) {
		return this.state.collect(pin, password, client);
	}

	firstToday(key: string) {
		return this.state.firstToday(key);
	}

	acquire(limits: Limit[]) {
		return this.state.acquire(limits);
	}
}
