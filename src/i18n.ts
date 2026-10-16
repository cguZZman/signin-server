// Page languages. The browser's Accept-Language picks one; ?lang= overrides it for a single page.
import { en } from './messages/en';
import { es } from './messages/es';
import { pt } from './messages/pt';

export const LANGUAGES = ['en', 'es', 'pt'] as const;
export type Lang = (typeof LANGUAGES)[number];

export type ErrorMessage = 'error.pin.invalid' | 'failure.denied' | 'failure.code.1' | 'failure.code.2' | 'failure.code.3' | 'failure.code.4';

/**
 * The texts of every page. Plain strings are inserted as they are (they may contain HTML, they are ours);
 * values from requests are always escaped by the pages.
 */
export interface Messages {
	// BCP 47 tag for <html lang> and Content-Language.
	tag: string;
	// Not translated: the donation page linked from every page's footer, set per request from FUNDING_URL.
	supportUrl?: string;
	// Formats amounts on the funding card.
	locale: string;
	steps: { label: string; code: string; signin: string; done: string };
	index: {
		title: string;
		heading: string;
		lead: string;
		notice: string;
		codeLabel: string;
		continue: string;
		aboutSummary: string;
		// HTML. source: the source code URL.
		about: (source: string) => string;
	};
	help: {
		summary: string;
		network: string;
		expired: string;
		// HTML around the already escaped id.
		sourceId: (id: string) => string;
		forum: string;
	};
	success: { title: string; heading: string; lead: string; another: string };
	funding: { title: string; text: string; progress: (raised: string, goal: string) => string; button: string };
	failure: { title: string; heading: string; lead: string; retry: string };
	errors: Record<ErrorMessage, string>;
	tooMany: { title: string; text: string };
	notFound: { title: string; text: string };
	footer: { privacy: string; source: string; support: string; disclaimer: string };
	privacy: {
		title: string;
		// HTML of the policy. source: the source code URL.
		body: (source: string) => string;
	};
}

const MESSAGES: Record<Lang, Messages> = { en, es, pt };

export function messages(lang: Lang): Messages {
	return MESSAGES[lang];
}

function supported(tag: string | null | undefined): Lang | null {
	const primary = (tag ?? '').trim().toLowerCase().split('-')[0];
	return (LANGUAGES as readonly string[]).includes(primary ?? '') ? (primary as Lang) : null;
}

/** The best supported language for an Accept-Language header (by q value, then order), or English. */
export function negotiate(acceptLanguage: string | null, override?: string | null): Lang {
	const forced = supported(override);
	if (forced) {
		return forced;
	}
	const ranges = (acceptLanguage ?? '')
		.split(',')
		.map((part, index) => {
			const [tag, ...params] = part.split(';');
			const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
			const quality = q ? Number.parseFloat(q.slice(2)) : 1;
			return { tag, quality: Number.isNaN(quality) ? 0 : quality, index };
		})
		.filter((range) => range.quality > 0)
		.sort((a, b) => b.quality - a.quality || a.index - b.index);
	for (const range of ranges) {
		const lang = supported(range.tag);
		if (lang) {
			return lang;
		}
	}
	return 'en';
}
