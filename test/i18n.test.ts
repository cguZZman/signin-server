import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGES, messages, negotiate } from '../src/i18n';
import { MockTokenEndpoint, Server, testEnv } from './helpers';

describe('language negotiation', () => {
	it('picks the best supported language from Accept-Language', () => {
		expect(negotiate(null)).toBe('en');
		expect(negotiate('')).toBe('en');
		expect(negotiate('es-MX,es;q=0.9,en;q=0.8')).toBe('es');
		expect(negotiate('pt-BR')).toBe('pt');
		expect(negotiate('pt-PT,pt;q=0.9')).toBe('pt');
		expect(negotiate('de-DE,de;q=0.9,es;q=0.5,en;q=0.4')).toBe('es');
		expect(negotiate('fr, en;q=0.1, pt;q=0.6')).toBe('pt');
		expect(negotiate('es;q=0, pt;q=0.2')).toBe('pt');
		expect(negotiate('*')).toBe('en');
		expect(negotiate('ES-419')).toBe('es');
	});

	it('lets ?lang override the browser', () => {
		expect(negotiate('es-MX', 'en')).toBe('en');
		expect(negotiate('en', 'pt')).toBe('pt');
		expect(negotiate('es', 'xx')).toBe('es');
	});
});

describe('translated pages', () => {
	let server: Server;
	beforeEach(() => {
		new MockTokenEndpoint().install();
		server = new Server(testEnv({ FUNDING_URL: 'https://example.org/donate', FUNDING_GOAL: '1500', FUNDING_RAISED: '420' }));
	});
	afterEach(() => vi.unstubAllGlobals());

	const lang = (value: string) => ({ headers: { 'Accept-Language': value } });

	it('follow the browser language', async () => {
		const es = await server.get('/', lang('es-MX,es;q=0.9'));
		expect(es.headers.get('Content-Language')).toBe('es');
		expect(es.headers.get('Vary')).toContain('Accept-Language');
		const page = await es.text();
		expect(page).toContain('<html lang="es">');
		expect(page).toContain('Conecta Kodi con tu nube');
		expect(await (await server.get('/', lang('pt-BR'))).text()).toContain('Conecte o Kodi à sua nuvem');
		expect(await (await server.get('/', lang('de'))).text()).toContain('Connect Kodi to your cloud drive');
	});

	it('translate errors, the success page and the funding card', async () => {
		expect(await (await server.get('/authorize?pin=ABCDEF', lang('es'))).text()).toContain('Ese código no funcionó');
		expect(await (await server.get('/callback?code=x&state=FFFFFF', lang('pt'))).text()).toContain('Seu código não é mais válido');
		const success = await (await server.get('/auth-success', lang('pt-BR'))).text();
		expect(success).toContain('Digitar outro código');
		expect(success).toContain('arrecadados este ano');
		expect(await (await server.get('/privacypolicy', lang('es'))).text()).toContain('Uso Limitado');
		expect(await (await server.get('/privacypolicy?lang=en', lang('es'))).text()).toContain('Limited Use requirements');
	});

	it('keep the app name and leave no inline scripts or styles in any language', async () => {
		for (const language of LANGUAGES) {
			for (const path of ['/', '/authorize?pin=ABCDEF', '/auth-success', '/callback?code=x', '/privacypolicy', '/x']) {
				const page = await (await server.get(path, lang(language))).text();
				expect(page, `${language} ${path}`).toContain('Cloud Drive Sign-in for Kodi');
				expect(page, `${language} ${path}`).not.toMatch(/<script(?![^>]*\ssrc=)/);
				expect(page, `${language} ${path}`).not.toMatch(/<style|\sstyle=|\son[a-z]+=/);
			}
		}
	});

	it('keep the same links and structure in every language', () => {
		const links = (html: string): string[] => [...(html.match(/href="[^"]*"/g) ?? [])].sort();
		const en = messages('en');
		for (const language of LANGUAGES) {
			const t = messages(language);
			expect(links(t.privacy.body('S')), language).toEqual(links(en.privacy.body('S')).concat(language === 'en' ? [] : ['href="/privacypolicy?lang=en"']).sort());
			expect(links(t.index.about('S')), language).toEqual(links(en.index.about('S')));
			expect((t.privacy.body('S').match(/<h2>/g) ?? []).length, language).toBe((en.privacy.body('S').match(/<h2>/g) ?? []).length);
		}
	});
});
