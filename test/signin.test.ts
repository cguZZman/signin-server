import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGNIN_COOKIE } from '../src/app';
import { PIN_LIFETIME_MS, SigninState } from '../src/state';
import { basic, CALLBACK, cookieValue, MockTokenEndpoint, s256, Server, testEnv } from './helpers';

// End-to-end check of the sign-in: code creation, the redirect to the provider, the callback, token pickup by
// Kodi and token refresh, for every provider, against a mock token endpoint. Rate limits are off here.
let tokens: MockTokenEndpoint;
let server: Server;

beforeEach(() => {
	tokens = new MockTokenEndpoint();
	tokens.install();
	server = new Server();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function createPin(provider: string, ip?: string): Promise<{ pin: string; password: string }> {
	return (await (await server.post('/pin', { provider }, { ip })).json()) as { pin: string; password: string };
}

async function startSignin(pin: string): Promise<{ browser: string; authorize: URL }> {
	const response = await server.get(`/signin/${pin}`);
	expect(response.status).toBe(302);
	return { browser: cookieValue(response.headers.get('Set-Cookie') ?? ''), authorize: new URL(response.headers.get('Location') ?? '') };
}

function callback(method: string, state: string, code: string, browser: string | null): Promise<Response> {
	const headers: Record<string, string> = browser === null ? {} : { Cookie: `${SIGNIN_COOKIE}=${browser}` };
	return method === 'POST'
		? server.post('/callback', { code, state }, { headers })
		: server.get(`/callback?code=${code}&state=${state}`, { headers });
}

describe.each([
	['googledrive', 'https://www.googleapis.com/auth/drive.readonly', 'GET'],
	['onedrive', 'offline_access sites.read.all files.read.all user.read', 'POST'],
	['dropbox', 'account_info.read files.metadata.read files.content.read', 'GET'],
])('sign-in with %s', (provider, scope, callbackMethod) => {
	it('runs the whole flow', async () => {
		const pin = (await (await server.post('/pin', { provider })).json()) as Record<string, string>;
		expect(pin.pin).toMatch(/^[0-9A-F]{6}$/);
		expect(pin.password?.length).toBeGreaterThan(100);
		expect(Object.keys(pin)).not.toContain('browserNonce');
		expect(Object.keys(pin)).not.toContain('codeVerifier');
		const { pin: code, password } = pin as { pin: string; password: string };

		expect((await server.get(`/pin/${code}`, { headers: basic(password) })).status).toBe(202);
		expect((await server.get(`/pin/${code}`, { headers: basic('wrong') })).status).toBe(404);

		const signin = await server.get(`/signin/${code}`);
		expect(signin.status).toBe(302);
		const setCookie = signin.headers.get('Set-Cookie') ?? '';
		expect(setCookie.startsWith(`${SIGNIN_COOKIE}=`)).toBe(true);
		for (const attribute of ['Path=/', 'Max-Age=300', 'Secure', 'HttpOnly', 'SameSite=None']) {
			expect(setCookie).toContain(attribute);
		}
		const authorize = new URL(signin.headers.get('Location') ?? '');
		expect(authorize.host + authorize.pathname).toBe(`login.example.com/${provider}/authorize`);
		const query = Object.fromEntries(authorize.searchParams);
		expect(query).toMatchObject({
			client_id: `${provider}-client`,
			redirect_uri: CALLBACK,
			response_type: 'code',
			state: code,
			scope,
			code_challenge_method: 'S256',
		});
		expect(query).toMatchObject(
			{
				googledrive: { access_type: 'offline', prompt: 'consent' },
				onedrive: { response_mode: 'form_post' },
				dropbox: { token_access_type: 'offline' },
			}[provider] ?? {},
		);

		const back = await callback(callbackMethod, code, 'the-code', cookieValue(setCookie));
		expect(back.status).toBe(302);
		expect(back.headers.get('Location')).toBe('/auth-success');
		expect(back.headers.get('Set-Cookie')).toContain('Max-Age=0');
		expect(tokens.last()).toMatchObject({
			grant_type: 'authorization_code',
			code: 'the-code',
			client_id: `${provider}-client`,
			client_secret: `${provider}-secret`,
			redirect_uri: CALLBACK,
		});
		expect(await s256(tokens.last().code_verifier ?? '')).toBe(query.code_challenge);

		const collected = await server.get(`/pin/${code}`, { headers: basic(password) });
		expect(collected.status).toBe(200);
		expect(await collected.json()).toMatchObject({ access_token: 'AT', refresh_token: 'RT' });
		expect((await server.get(`/pin/${code}`, { headers: basic(password) })).status).toBe(404);

		const refreshed = await server.post('/refresh', { provider, refresh_token: 'RT' });
		expect(refreshed.status).toBe(200);
		expect(await refreshed.json()).toMatchObject({ access_token: 'AT' });
		expect(tokens.last()).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'RT', client_secret: `${provider}-secret` });
		expect(tokens.last()).not.toHaveProperty('code_verifier');
		expect(tokens.last()).not.toHaveProperty('redirect_uri');
	});

	it('only finishes in the browser that started the sign-in', async () => {
		// The attack: someone creates a code, starts the sign-in in their own browser and sends the provider link to a victim.
		const { pin, password } = await createPin(provider);
		const { browser: attackerBrowser } = await startSignin(pin);

		expect(await (await callback(callbackMethod, pin, 'victim-code', null)).text()).toContain('different browser');
		expect(await (await callback(callbackMethod, pin, 'victim-code', 'forged')).text()).toContain('different browser');
		expect((await server.get(`/pin/${pin}`, { headers: basic(password) })).status).toBe(202);

		expect((await callback(callbackMethod, pin, 'own-code', attackerBrowser)).status).toBe(302);
		expect(await (await callback(callbackMethod, pin, 'replayed-code', attackerBrowser)).text()).toContain('different browser');
	});
});

describe('sign-in', () => {
	it('rejects a callback without a started sign-in', async () => {
		const { pin } = await createPin('googledrive');
		expect(await (await callback('GET', pin, 'x', 'anything')).text()).toContain('different browser');
	});

	it('rejects unknown providers', async () => {
		expect((await server.post('/pin', { provider: 'box' })).status).toBe(400);
		expect((await server.post('/pin', {})).status).toBe(400);
	});

	it('only starts from the network of the Kodi device', async () => {
		const { pin } = await createPin('onedrive', '198.51.100.7');
		const page = await (await server.get(`/signin/${pin}`)).text();
		expect(page).toContain('That code didn');
		expect((await server.get(`/signin/${pin}`, { ip: '198.51.100.7' })).status).toBe(302);
	});

	it('pairs IPv6 devices on the same network (/64)', async () => {
		const { pin } = await createPin('onedrive', '2001:db8:1:2::10');
		expect((await server.get(`/signin/${pin}`, { ip: '2001:db8:1:3::99' })).status).toBe(200);
		expect((await server.get(`/signin/${pin}`, { ip: '2001:0db8:0001:0002:abcd:ef01:2345:6789' })).status).toBe(302);
	});

	it('pairs over the other IP version once Kodi has polled over it with its secret', async () => {
		const { pin, password } = await createPin('googledrive', '203.0.113.10');
		const phone = '2001:db8:1:2:abcd::99';
		expect((await server.get(`/signin/${pin}`, { ip: phone })).status).toBe(200);
		expect((await server.get(`/pin/${pin}`, { headers: basic('wrong'), ip: '2001:db8:1:2::10' })).status).toBe(404);
		expect((await server.get(`/signin/${pin}`, { ip: phone })).status, 'a wrong secret registers nothing').toBe(200);
		expect((await server.get(`/pin/${pin}`, { headers: basic(password), ip: '2001:db8:1:2::10' })).status).toBe(202);
		expect((await server.get(`/signin/${pin}`, { ip: phone })).status).toBe(302);
		expect((await server.get(`/signin/${pin}`, { ip: '198.51.100.1' })).status, 'other networks still rejected').toBe(200);
	});

	it('accepts the code from the form, in any case, with O typed for zero', async () => {
		const { pin } = await createPin('onedrive');
		const typed = pin.toLowerCase().replace(/0/g, 'o');
		expect((await server.post('/authorize', { pin: typed })).status).toBe(302);
		expect((await server.get(`/authorize?pin=${pin}`)).status).toBe(302);
	});

	it('shows an error and keeps the code when it is wrong', async () => {
		const page = await (await server.get('/authorize?pin=ABCDEO')).text();
		expect(page).toContain('That code didn');
		expect(page).toContain('aria-invalid="true"');
		expect(page).toContain('value="ABCDE0"');
		expect(await (await server.get('/authorize?pin=%22%3E%3Cscript%3E')).text()).not.toContain('<script>');
	});

	it('codes expire after 3 minutes', async () => {
		let now = 1_000_000;
		server = new Server(testEnv(), new SigninState(() => now));
		const { pin, password } = await createPin('onedrive');
		now += PIN_LIFETIME_MS - 1;
		expect((await server.get(`/pin/${pin}`, { headers: basic(password) })).status).toBe(202);
		now += 1;
		expect((await server.get(`/pin/${pin}`, { headers: basic(password) })).status).toBe(404);
		expect((await server.get(`/signin/${pin}`)).status).toBe(200);
	});

	it('explains callback errors', async () => {
		expect(await (await server.get('/callback?error=access_denied&error_description=nope')).text()).toContain('Access was not granted');
		expect(await (await server.get('/callback?error=server_error&error_description=nope')).text()).toContain('server_error: nope');
		expect(await (await server.get('/callback?error=x&error_description=%3Cb%3E')).text()).toContain('x: &lt;b&gt;');
		expect(await (await server.get('/callback?code=x&state=FFFFFF')).text()).toContain('no longer valid');
		expect(await (await server.get('/callback?code=x')).text()).toContain('request was invalid');
	});

	it('explains a failed code exchange', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { pin, password } = await createPin('googledrive');
		const { browser } = await startSignin(pin);
		const page = await callback('GET', pin, 'bad-code', browser);
		const text = await page.text();
		expect(text).toContain('get authorization from the provider');
		expect(text).toContain('(invalid_grant)');
		expect(page.headers.get('Set-Cookie')).toContain('Max-Age=0');
		expect((await server.get(`/pin/${pin}`, { headers: basic(password) })).status).toBe(202);
		expect(warn.mock.calls.join('\n')).not.toContain('bad-code');
	});
});

describe('refresh', () => {
	it('reports errors and logs them without the token', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const response = await server.post('/refresh', { provider: 'googledrive', refresh_token: 'bad-secret-refresh-token' });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'invalid_grant' });
		expect((await server.post('/refresh', {})).status).toBe(400);
		const logged = warn.mock.calls.join('\n');
		expect(logged).toContain(
			'Token request failed: provider=googledrive app=current grant_type=refresh_token status=400 error=invalid_grant description=Token has been expired or revoked.',
		);
		expect(logged).not.toContain('bad-secret-refresh-token');
	});

	it('refreshes tokens of the legacy app with its credentials', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const response = await server.post('/refresh', { provider: 'onedrive', refresh_token: 'legacy-RT' });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ access_token: 'AT' });
		expect(tokens.last()).toMatchObject({ client_id: 'onedrive-legacy-client', client_secret: 'onedrive-legacy-secret' });
		expect(log.mock.calls.join('\n')).toContain('Token request succeeded with the legacy app: provider=onedrive');

		tokens.forms = [];
		expect((await server.post('/refresh', { provider: 'onedrive', refresh_token: 'RT' })).status).toBe(200);
		expect(tokens.forms.map((f) => f.client_id)).toEqual(['onedrive-client']);
	});

	it('only tries the current app when there is no legacy one', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect((await server.post('/refresh', { provider: 'googledrive', refresh_token: 'legacy-RT' })).status).toBe(400);
		expect(tokens.forms.map((f) => f.client_id)).toEqual(['googledrive-client']);
	});

	it("reports the current app's error when both reject the token", async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect((await server.post('/refresh', { provider: 'onedrive', refresh_token: 'bad-token' })).status).toBe(400);
		const logged = warn.mock.calls.join('\n');
		expect(logged).toContain('provider=onedrive app=current grant_type=refresh_token status=400');
		expect(logged).toContain('provider=onedrive app=legacy grant_type=refresh_token status=400');
		expect(logged).not.toContain('bad-token');
	});
});
