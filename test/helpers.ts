import { vi } from 'vitest';
import { handle } from '../src/app';
import type { Env } from '../src/env';
import { SigninState } from '../src/state';

export const SITE = 'https://signin.example.com';
export const CALLBACK = `${SITE}/callback`;
export const TOKEN_URL = 'https://tokens.example.com/token';

export function testEnv(overrides: Partial<Env> = {}): Env {
	const env: Env = {
		SITE_URL: SITE,
		RATE_LIMIT_PIN: '0',
		RATE_LIMIT_SIGNIN: '0',
		RATE_LIMIT_REFRESH_IP: '0',
		RATE_LIMIT_REFRESH_TOKEN: '0',
		// Only OneDrive has a legacy app, so both cases are covered.
		PROVIDER_ONEDRIVE_LEGACY_CLIENT_ID: 'onedrive-legacy-client',
		PROVIDER_ONEDRIVE_LEGACY_CLIENT_SECRET: 'onedrive-legacy-secret',
	};
	const settings = env as unknown as Record<string, string | undefined>;
	for (const provider of ['googledrive', 'onedrive', 'dropbox']) {
		const prefix = `PROVIDER_${provider.toUpperCase()}`;
		settings[`${prefix}_CLIENT_ID`] = `${provider}-client`;
		settings[`${prefix}_CLIENT_SECRET`] = `${provider}-secret`;
		settings[`${prefix}_URL_AUTHORIZE`] = `https://login.example.com/${provider}/authorize`;
		settings[`${prefix}_URL_TOKEN`] = TOKEN_URL;
	}
	return { ...env, ...overrides };
}

/**
 * Stands in for the Google and Microsoft token endpoints. Answers with fake tokens, except a refresh_token
 * starting with "bad", which gets 400 invalid_grant, and refresh tokens that belong to the other app:
 * tokens starting with "legacy" only refresh with a legacy client ID, and the others only with a current one.
 */
export class MockTokenEndpoint {
	forms: Record<string, string>[] = [];

	install(): void {
		vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
			if (String(url) !== TOKEN_URL || init?.method !== 'POST') {
				throw new Error(`Unexpected request to ${String(url)}`);
			}
			const form = Object.fromEntries(new URLSearchParams(String(init.body)));
			this.forms.push(form);
			const refreshToken = form.refresh_token ?? '';
			const otherApp = refreshToken !== '' && refreshToken.startsWith('legacy') !== (form.client_id ?? '').includes('-legacy-');
			if (refreshToken.startsWith('bad') || otherApp || form.code === 'bad-code') {
				return Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 });
			}
			return Response.json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 });
		});
	}

	last(): Record<string, string> {
		const form = this.forms.at(-1);
		if (!form) {
			throw new Error('No token request');
		}
		return form;
	}
}

/** The service with its own in-memory state, as one Durable Object would hold it. */
export class Server {
	constructor(
		readonly env: Env = testEnv(),
		readonly state: SigninState = new SigninState(),
	) {}

	request(path: string, init: RequestInit & { ip?: string; base?: string } = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		headers.set('CF-Connecting-IP', init.ip ?? '203.0.113.10');
		return handle(new Request(new URL(path, init.base ?? SITE), { ...init, headers, redirect: 'manual' }), this.env, this.state);
	}

	get(path: string, init: RequestInit & { ip?: string; base?: string } = {}): Promise<Response> {
		return this.request(path, init);
	}

	post(path: string, form: Record<string, string>, init: RequestInit & { ip?: string; base?: string } = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		headers.set('Content-Type', 'application/x-www-form-urlencoded');
		return this.request(path, { ...init, method: 'POST', headers, body: new URLSearchParams(form).toString() });
	}
}

export function basic(password: string): Record<string, string> {
	return { Authorization: `Basic ${btoa(`:${password}`)}` };
}

export function cookieValue(setCookie: string): string {
	return setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
}

export async function s256(verifier: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
	return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
