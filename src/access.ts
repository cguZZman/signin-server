import type { Env } from './env';

/**
 * Checks the Cloudflare Access login of a request to a private page: the Cf-Access-Jwt-Assertion header must be a
 * token signed by the team's Access keys, for this application (ACCESS_AUD), not expired. Access already blocks
 * everyone else at Cloudflare's edge; this keeps the page closed if the Access application is ever removed or
 * misconfigured. Returns the signed-in email, or null.
 */
export async function accessUser(request: Request, env: Env, now = Date.now()): Promise<string | null> {
	const team = env.ACCESS_TEAM_DOMAIN;
	const audience = env.ACCESS_AUD;
	const token = request.headers.get('Cf-Access-Jwt-Assertion');
	if (!team || !audience || !token) {
		return null;
	}
	const parts = token.split('.');
	if (parts.length !== 3) {
		return null;
	}
	const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
	let header: { alg?: string; kid?: string };
	let payload: { aud?: string | string[]; exp?: number; nbf?: number; iss?: string; email?: string };
	try {
		header = JSON.parse(base64UrlText(encodedHeader));
		payload = JSON.parse(base64UrlText(encodedPayload));
	} catch {
		return null;
	}
	if (header.alg !== 'RS256' || !header.kid) {
		return null;
	}
	const key = await signingKey(team, header.kid, now);
	if (!key) {
		return null;
	}
	const valid = await crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		key,
		base64UrlBytes(encodedSignature),
		new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
	);
	const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
	const seconds = now / 1000;
	if (
		!valid ||
		!audiences.includes(audience) ||
		payload.iss !== `https://${team}` ||
		typeof payload.exp !== 'number' ||
		payload.exp <= seconds ||
		(typeof payload.nbf === 'number' && payload.nbf > seconds + 60)
	) {
		return null;
	}
	return payload.email ?? '';
}

// The team's public keys, refetched every 10 minutes or when a token names an unknown key (Access rotates them).
const KEYS_TTL_MS = 10 * 60 * 1000;
let cached: { team: string; fetched: number; keys: Map<string, CryptoKey> } | null = null;

async function signingKey(team: string, kid: string, now: number): Promise<CryptoKey | null> {
	if (!cached || cached.team !== team || now - cached.fetched > KEYS_TTL_MS || !cached.keys.has(kid)) {
		const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
		if (!response.ok) {
			return null;
		}
		const { keys = [] } = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
		const imported = new Map<string, CryptoKey>();
		for (const jwk of keys) {
			if (jwk.kid && jwk.kty === 'RSA') {
				imported.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
			}
		}
		cached = { team, fetched: now, keys: imported };
	}
	return cached.keys.get(kid) ?? null;
}

/** For tests: forget the cached keys. */
export function clearAccessKeys(): void {
	cached = null;
}

function base64UrlBytes(value: string): Uint8Array {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function base64UrlText(value: string): string {
	return new TextDecoder().decode(base64UrlBytes(value));
}
