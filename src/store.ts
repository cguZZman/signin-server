import { DurableObject } from 'cloudflare:workers';
import { type DayCounts, UsageArchive } from './archive';
import type { Env } from './env';
import { type Limit, type OwnClient, SigninState, type Tokens } from './state';

/**
 * The single instance holding the sign-in codes and rate-limit counters, in memory only. Kodi polls every
 * few seconds during a sign-in, which keeps the object in memory for as long as a code lives. Its storage only
 * keeps the usage history (archive.ts).
 */
export class SigninStore extends DurableObject<Env> {
	private readonly state = new SigninState();
	private readonly archive = new UsageArchive(this.ctx.storage.sql);

	createPin(provider: string, owner: string, ownClientSupported?: boolean) {
		return this.state.createPin(provider, owner, ownClientSupported);
	}

	startSignin(pin: string, client: string, ownClient?: OwnClient) {
		return this.state.startSignin(pin, client, ownClient);
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

	countOwnApp(provider: string, clientId: string, day: string) {
		return this.archive.countOwnApp(provider, clientId, day);
	}

	ownApps(since: string) {
		return this.archive.ownApps(since);
	}

	saveDay(day: string, counts: DayCounts, archivedAt: number) {
		return this.archive.saveDay(day, counts, archivedAt);
	}

	archivedDays() {
		return this.archive.archivedDays();
	}

	history() {
		return this.archive.history();
	}
}
