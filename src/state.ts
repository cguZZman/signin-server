// Sign-in codes and rate-limit counters. Everything lives in memory: nothing is written to storage.
// In production one Durable Object (store.ts) holds the only instance, so every request sees the same codes.

export const PIN_LIFETIME_MS = 3 * 60 * 1000;
export const RATE_WINDOW_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 1000;

export type Tokens = Record<string, unknown>;

interface Pin {
	pin: string;
	password: string;
	provider: string;
	// Public IP of the Kodi device. The browser must come from the same one.
	owner: string;
	expires: number;
	// Set when the browser starts the sign-in; ties the callback to that browser (see the sign-in cookie).
	browserNonce?: string;
	codeVerifier?: string;
	tokens?: Tokens;
}

export interface CreatedPin {
	pin: string;
	password: string;
	provider: string;
	owner: string;
}

export interface StartedSignin {
	provider: string;
	browserNonce: string;
	codeVerifier: string;
}

export type FinishedSignin =
	| { status: 'ok'; provider: string; codeVerifier: string }
	| { status: 'expired' }
	| { status: 'other-browser' };

export type Collected =
	| { status: 200; tokens: Tokens }
	| { status: 202 }
	| { status: 404 };

/** A rate limit: requests per minute for a key. A limit of 0 or less is no limit. */
export interface Limit {
	name: string;
	key: string;
	limit: number;
}

export class SigninState {
	private readonly pins = new Map<string, Pin>();
	// Fixed windows: a counter expires one window after its first request.
	private readonly counters = new Map<string, { count: number; expires: number }>();
	private nextSweep = 0;

	constructor(private readonly now: () => number = Date.now) {}

	createPin(provider: string, owner: string): CreatedPin {
		this.sweep();
		let pin: string;
		do {
			pin = hex(3).toUpperCase();
		} while (this.pins.has(pin));
		const created = { pin, password: hex(256), provider, owner };
		this.pins.set(pin, { ...created, expires: this.now() + PIN_LIFETIME_MS });
		return created;
	}

	/** Starts the sign-in in a browser on the Kodi device's network. Null when the code is unknown or from another network. */
	startSignin(pin: string, client: string): StartedSignin | null {
		const stored = this.get(pin);
		if (!stored || stored.owner !== client) {
			return null;
		}
		stored.browserNonce = base64url(32);
		stored.codeVerifier = base64url(32);
		return { provider: stored.provider, browserNonce: stored.browserNonce, codeVerifier: stored.codeVerifier };
	}

	/** Accepts the provider's callback once, and only in the browser that started the sign-in. */
	finishSignin(pin: string, browserNonce: string | null): FinishedSignin {
		const stored = this.get(pin);
		if (!stored) {
			return { status: 'expired' };
		}
		if (!stored.browserNonce || !stored.codeVerifier || !browserNonce || !equal(stored.browserNonce, browserNonce)) {
			return { status: 'other-browser' };
		}
		// Single use: a second callback for this code is rejected.
		stored.browserNonce = undefined;
		return { status: 'ok', provider: stored.provider, codeVerifier: stored.codeVerifier };
	}

	storeTokens(pin: string, tokens: Tokens): boolean {
		const stored = this.get(pin);
		if (!stored) {
			return false;
		}
		stored.tokens = tokens;
		return true;
	}

	/** Kodi collects the tokens with the secret it got with the code. Tokens are handed out once. */
	collect(pin: string, password: string, client: string): Collected {
		const stored = this.get(pin);
		if (!stored || stored.owner !== client || !equal(stored.password, password)) {
			return { status: 404 };
		}
		if (!stored.tokens) {
			return { status: 202 };
		}
		this.pins.delete(stored.pin);
		return { status: 200, tokens: stored.tokens };
	}

	/** Counts a request against each limit. Returns the name of the first exceeded limit, or null. */
	acquire(limits: Limit[]): string | null {
		this.sweep();
		const now = this.now();
		for (const { name, key, limit } of limits) {
			if (limit <= 0) {
				continue;
			}
			let counter = this.counters.get(key);
			if (!counter || counter.expires <= now) {
				counter = { count: 0, expires: now + RATE_WINDOW_MS };
				this.counters.set(key, counter);
			}
			if (++counter.count > limit) {
				return name;
			}
		}
		return null;
	}

	private get(pin: string): Pin | undefined {
		const stored = this.pins.get(pin.toUpperCase());
		if (stored && stored.expires <= this.now()) {
			this.pins.delete(stored.pin);
			return undefined;
		}
		return stored;
	}

	private sweep(): void {
		const now = this.now();
		if (now < this.nextSweep) {
			return;
		}
		this.nextSweep = now + SWEEP_INTERVAL_MS;
		for (const [key, pin] of this.pins) {
			if (pin.expires <= now) {
				this.pins.delete(key);
			}
		}
		for (const [key, counter] of this.counters) {
			if (counter.expires <= now) {
				this.counters.delete(key);
			}
		}
	}
}

function randomBytes(length: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(length));
}

function hex(bytes: number): string {
	return Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64url(bytes: number): string {
	return toBase64url(randomBytes(bytes));
}

export function toBase64url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compares secrets without stopping at the first difference. */
function equal(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
