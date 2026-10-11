import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientAddress, sourceId } from '../src/app';
import { ipv6Groups, network } from '../src/state';
import { MockTokenEndpoint, Server, testEnv } from './helpers';

let server: Server;

beforeEach(() => {
	new MockTokenEndpoint().install();
	server = new Server();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('pages', () => {
	it('render', async () => {
		const index = await (await server.get('/')).text();
		expect(index).toContain('Connect Kodi to your cloud drive');
		expect(index, 'warns against codes from others (device-code phishing)').toContain('Only enter a code shown by your own Kodi device');
		expect(index).toContain('never asks for or sees your password');
		const success = await server.get('/auth-success');
		expect(success.status).toBe(200);
		const body = await success.text();
		expect(body).toContain('signed in');
		expect(body).not.toContain('class="funding"');
		const privacy = await (await server.get('/privacypolicy')).text();
		expect(privacy).toContain('Limited Use');
		expect(privacy).toContain('Cloudflare');
		expect(privacy).not.toContain('profile');
		expect(privacy).not.toContain('Heroku');
		expect((await server.get('/nothing-here')).status).toBe(404);
	});

	it('show the funding card when configured', async () => {
		server = new Server(testEnv({ FUNDING_URL: 'https://example.org/donate', FUNDING_GOAL: '1500', FUNDING_RAISED: '420' }));
		const page = await (await server.get('/auth-success')).text();
		for (const part of ['class="funding"', 'href="https://example.org/donate"', 'value="28"', '$420 of $1,500 raised this year']) {
			expect(page).toContain(part);
		}
	});

	it('have no inline scripts or styles', async () => {
		// The CSP blocks inline code, so any of these would silently break in the browser.
		for (const path of ['/', '/authorize?pin=ABCDEF', '/auth-success', '/callback?code=x', '/privacypolicy', '/failure', '/x']) {
			const page = await (await server.get(path)).text();
			expect(page, path).not.toMatch(/<script(?![^>]*\ssrc=)/);
			expect(page, path).not.toMatch(/<style|\sstyle=|\son[a-z]+=/);
		}
	});

	it('carry the security headers', async () => {
		for (const response of [await server.get('/'), await server.post('/pin', { provider: 'onedrive' })]) {
			const csp = response.headers.get('Content-Security-Policy') ?? '';
			for (const directive of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'"]) {
				expect(csp).toContain(directive);
			}
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
			expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
		}
	});
});

describe('addresses', () => {
	it('redirect plain HTTP to HTTPS, keeping the method of POSTs', async () => {
		const page = await server.get('/privacypolicy?x=1', { base: 'http://signin.example.com' });
		expect(page.status).toBe(301);
		expect(page.headers.get('Location')).toBe('https://signin.example.com/privacypolicy?x=1');
		const post = await server.post('/pin', { provider: 'onedrive' }, { base: 'http://signin.example.com' });
		expect(post.status).toBe(308);
		expect(post.headers.get('Location')).toBe('https://signin.example.com/pin');
	});

	it('redirect other host names to the site', async () => {
		const page = await server.get('/signin/ABCDEF', { base: 'https://signin-other.example.com' });
		expect(page.status).toBe(301);
		expect(page.headers.get('Location')).toBe('https://signin.example.com/signin/ABCDEF');
	});

	it('allow plain HTTP when HTTPS is not required (local development)', async () => {
		server = new Server(testEnv({ SITE_URL: 'http://localhost:8787', REQUIRE_HTTPS: 'false' }));
		expect((await server.get('/', { base: 'http://localhost:8787' })).status).toBe(200);
	});

	it('pair by the address Cloudflare reports', async () => {
		expect(await (await server.get('/ip', { ip: '198.51.100.20' })).text()).toBe('198.51.100.20');
		expect(clientAddress(new Request('https://x/', { headers: { 'CF-Connecting-IP': '::1' } }))).toBe('127.0.0.1');
		expect(clientAddress(new Request('https://x/'))).toBe('127.0.0.1');
	});

	it('compute the source id like the add-on', () => {
		expect(sourceId('203.0.113.10')).toBe('326');
		expect(sourceId('2001:db8:1:2::1')).toBe(String(0x2001 + 0xdb8 + 1 + 2));
		expect(sourceId('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(sourceId('2001:db8:1:2::1'));
		expect(sourceId('not an address')).toBe('-1');
	});

	it('group IPv6 addresses by /64 network', () => {
		expect(network('203.0.113.10')).toBe('203.0.113.10');
		expect(network('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
		expect(network('2001:0DB8:0001:0002:0:0:0:5')).toBe('2001:db8:1:2::/64');
		expect(network('::1')).toBe('0:0:0:0::/64');
		expect(ipv6Groups('::ffff:192.0.2.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc000, 0x0201]);
		expect(ipv6Groups('2001:db8::1::2')).toBeNull();
		expect(ipv6Groups('2001:db8:1:2:3:4:5')).toBeNull();
		expect(ipv6Groups('12345::')).toBeNull();
		expect(ipv6Groups('203.0.113.10')).toBeNull();
	});
});

describe('rate limits', () => {
	beforeEach(() => {
		server = new Server(testEnv({ RATE_LIMIT_PIN: '2', RATE_LIMIT_SIGNIN: '2', RATE_LIMIT_REFRESH_IP: '3', RATE_LIMIT_REFRESH_TOKEN: '2' }));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('limit code creation per client', async () => {
		const create = (ip: string) => server.post('/pin', { provider: 'googledrive' }, { ip });
		expect((await create('203.0.113.1')).status).toBe(200);
		expect((await create('203.0.113.1')).status).toBe(200);
		const limited = await create('203.0.113.1');
		expect(limited.status).toBe(429);
		expect(limited.headers.get('Retry-After')).toBe('60');
		expect(limited.headers.get('Content-Security-Policy')).not.toBeNull();
		expect((await create('203.0.113.2')).status).toBe(200);
	});

	it('limit sign-in pages with a friendly page', async () => {
		const ip = '203.0.113.4';
		expect((await server.get('/authorize?pin=AAAAAA', { ip })).status).toBe(200);
		expect((await server.get('/signin/AAAAAA', { ip })).status).toBe(200);
		const limited = await server.get('/authorize?pin=AAAAAA', { ip, headers: { Accept: 'text/html' } });
		expect(limited.status).toBe(429);
		expect(await limited.text()).toContain('Too many attempts');
	});

	it('limit refreshes per token', async () => {
		const refresh = (ip: string) => server.post('/refresh', { provider: 'googledrive', refresh_token: 'same-token' }, { ip });
		expect((await refresh('203.0.113.5')).status).toBe(200);
		expect((await refresh('203.0.113.6')).status).toBe(200);
		expect((await refresh('203.0.113.7')).status).toBe(429);
	});

	it('limit refreshes per client', async () => {
		const refresh = (token: string) => server.post('/refresh', { provider: 'googledrive', refresh_token: token }, { ip: '203.0.113.8' });
		for (const token of ['token-a', 'token-b', 'token-c']) {
			expect((await refresh(token)).status).toBe(200);
		}
		expect((await refresh('token-d')).status).toBe(429);
	});

	it('reset after a minute', async () => {
		let now = 1_000_000;
		const { SigninState } = await import('../src/state');
		server = new Server(server.env, new SigninState(() => now));
		const create = () => server.post('/pin', { provider: 'onedrive' }, { ip: '203.0.113.9' });
		await create();
		await create();
		expect((await create()).status).toBe(429);
		now += 60_000;
		expect((await create()).status).toBe(200);
	});
});
