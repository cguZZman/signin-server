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
	// Networks of the Kodi device (see network()). The browser must come from one of them. Starts with the
	// network that created the code; Kodi adds its other one (IPv4 or IPv6) by polling over it with the password.
	owners: Set<string>;
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
	// Accounts (hashes of refresh tokens) that refreshed today, UTC: only to count each account once a day.
	// Memory only, emptied when the day changes.
	private activeDay = '';
	private readonly active = new Set<string>();

	constructor(private readonly now: () => number = Date.now) {}

	createPin(provider: string, owner: string): CreatedPin {
		this.sweep();
		let pin: string;
		do {
			pin = hex(3).toUpperCase();
		} while (this.pins.has(pin));
		const created = { pin, password: hex(256), provider, owner };
		this.pins.set(pin, { pin, password: created.password, provider, owners: new Set([network(owner)]), expires: this.now() + PIN_LIFETIME_MS });
		return created;
	}

	/** Starts the sign-in in a browser on the Kodi device's network. Null when the code is unknown or from another network. */
	startSignin(pin: string, client: string): StartedSignin | null {
		const stored = this.get(pin);
		if (!stored || !stored.owners.has(network(client))) {
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

	/**
	 * Kodi collects the tokens with the secret it got with the code. Tokens are handed out once. Only Kodi knows
	 * the secret, so the network it polls from is one of Kodi's networks.
	 */
	collect(pin: string, password: string, client: string): Collected {
		const stored = this.get(pin);
		if (!stored || !equal(stored.password, password)) {
			return { status: 404 };
		}
		stored.owners.add(network(client));
		if (!stored.tokens) {
			return { status: 202 };
		}
		this.pins.delete(stored.pin);
		return { status: 200, tokens: stored.tokens };
	}

	/** True the first time the key (a provider and token hash) is seen in the current UTC day. */
	firstToday(key: string): boolean {
		const day = new Date(this.now()).toISOString().slice(0, 10);
		if (day !== this.activeDay) {
			this.activeDay = day;
			this.active.clear();
		}
		if (this.active.has(key)) {
			return false;
		}
		this.active.add(key);
		return true;
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

/**
 * The network an address belongs to: an IPv4 address as is (a home network shares one), and for IPv6 its /64
 * prefix, because every device on a home network gets its own IPv6 address within the network's /64.
 */
export function network(address: string): string {
	const groups = ipv6Groups(address);
	return groups ? `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64` : address;
}

/** The eight 16-bit groups of an IPv6 address, or null when it isn't one. */
export function ipv6Groups(address: string): number[] | null {
	if (!address.includes(':')) {
		return null;
	}
	const halves = address.toLowerCase().split('::');
	if (halves.length > 2) {
		return null;
	}
	const parse = (part: string | undefined) => (part ? part.split(':') : []);
	const head = parse(halves[0]);
	const tail = parse(halves[1]);
	const last = tail.length ? tail : head;
	// IPv4-mapped or embedded form, e.g. ::ffff:192.0.2.1
	const dotted = last.at(-1);
	if (dotted?.includes('.')) {
		const octets = dotted.split('.').map(Number);
		last.splice(-1, 1, ((octets[0] ?? 0) * 256 + (octets[1] ?? 0)).toString(16), ((octets[2] ?? 0) * 256 + (octets[3] ?? 0)).toString(16));
	}
	const missing = 8 - head.length - tail.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) {
		return null;
	}
	const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((g) => Number.parseInt(g, 16));
	return groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
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
