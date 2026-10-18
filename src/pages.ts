// The HTML pages, in the language of the given messages (src/messages). Styles and script are in public/.
import type { ErrorMessage, Messages } from './i18n';

export const SOURCE_URL = 'https://github.com/cguZZman/signin-server';
// Not translated: it is the app's name, and must match the name on the providers' consent screens.
const APP_NAME = 'Cloud Drive Sign-in for Kodi';

/** Escapes text for HTML content and attribute values. */
export function escape(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Drives the step indicator: 'code' (step 1), 'error' (step 2 failed), 'done' (all steps), or null (hidden).
type State = 'code' | 'error' | 'done' | null;

function steps(t: Messages, state: State): string {
	if (state === null) {
		return '';
	}
	const step = (number: number, label: string, className: string, current: boolean) =>
		`<li class="step${className ? ` ${className}` : ''}"${current ? ' aria-current="step"' : ''}>` +
		`<span class="step-dot" aria-hidden="true">${number}</span><span>${label}</span></li>`;
	return `<ol class="steps" aria-label="${t.steps.label}">
				${step(1, t.steps.code, state === 'code' ? 'current' : 'complete', state === 'code')}
				${step(2, t.steps.signin, state === 'done' ? 'complete' : state === 'error' ? 'failed' : '', state === 'error')}
				${step(3, t.steps.done, state === 'done' ? 'complete current' : '', state === 'done')}
			</ol>`;
}

function layout(t: Messages, title: string, state: State, content: string, head = ''): string {
	return `<!DOCTYPE html>
<html lang="${t.tag}">
<head>
	<meta charset="utf-8"/>
	<meta name="viewport" content="width=device-width, initial-scale=1"/>
	<meta name="color-scheme" content="light dark"/>
	<meta name="description" content="Sign-in page of the open-source Google Drive, OneDrive and Dropbox add-ons for the Kodi media center."/>
	<title>${escape(title)} · ${APP_NAME}</title>
	<link rel="icon" href="/favicon.ico"/>
	<link rel="stylesheet" href="/css/app.css"/>
	<script src="/js/app.js" defer></script>${head}
</head>
<body>
	<main class="shell">
		<a class="brand" href="/">
			<svg class="brand-icon" viewBox="0 0 48 48" aria-hidden="true">
				<path d="M12 6h24a4 4 0 0 1 4 4l3 18H5l3-18a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
				<rect x="5" y="28" width="38" height="14" rx="5" fill="none" stroke="currentColor" stroke-width="2.5"/>
				<circle cx="36" cy="35" r="2.2" fill="currentColor"/>
				<path d="M18.5 22.5h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2 3.4 3.4 0 0 0-.8 6.8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
			</svg>
			<span>${APP_NAME}</span>
		</a>

		<div class="card">
			${steps(t, state)}
			${content}
		</div>

		<footer class="footer">
			<nav class="footer-links">
				<a href="/privacypolicy">${t.footer.privacy}</a>
				<a href="${SOURCE_URL}">${t.footer.source}</a>
				${t.supportUrl ? `<a href="${escape(t.supportUrl)}" target="_blank" rel="noopener noreferrer">${t.footer.support}</a>` : ''}
			</nav>
			<p>${t.footer.disclaimer}</p>
		</footer>
	</main>
</body>
</html>
`;
}

function forumLinks(t: Messages): string {
	return `<li>
				<span>${t.help.forum}</span>
				<a href="https://forum.kodi.tv/showthread.php?tid=324784">Google Drive</a> ·
				<a href="https://forum.kodi.tv/showthread.php?tid=228443">OneDrive</a>
			</li>`;
}

export function indexPage(t: Messages, sourceId: string, pin = '', error?: ErrorMessage): string {
	const invalid = error ? ' aria-invalid="true" aria-describedby="pin-error"' : '';
	return layout(
		t,
		t.index.title,
		'code',
		`<h1>${t.index.heading}</h1>
	<p class="lead">${t.index.lead}</p>
	<p class="notice">${t.index.notice}</p>

	<form class="code-form" method="post" action="/authorize">
		<label class="visually-hidden" for="pin">${t.index.codeLabel}</label>
		<div class="code-field">
			<input id="pin" name="pin" type="text" required autofocus
				maxlength="6" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"
				value="${escape(pin)}" placeholder="A1B2C3"${invalid}/>
			<div class="code-boxes" aria-hidden="true">
				<span class="code-box"></span><span class="code-box"></span><span class="code-box"></span>
				<span class="code-box"></span><span class="code-box"></span><span class="code-box"></span>
			</div>
		</div>
		${error ? `<p id="pin-error" class="alert" role="alert">${t.errors[error]}</p>` : ''}
		<button class="button primary block" type="submit">${t.index.continue}</button>
	</form>

	<details class="help">
		<summary>${t.index.aboutSummary}</summary>
		<p>
			${t.index.about(SOURCE_URL)}
		</p>
	</details>

	<details class="help">
		<summary>${t.help.summary}</summary>
		<ul>
			<li>${t.help.network}</li>
			<li>${t.help.expired}</li>
			<li>${t.help.sourceId(escape(sourceId))}</li>
			${forumLinks(t)}
		</ul>
	</details>`,
	);
}

export interface Funding {
	url: string;
	goal: number;
	raised: number;
}

export function successPage(t: Messages, funding: Funding | null): string {
	let card = '';
	if (funding) {
		let progress = '';
		if (funding.goal > 0) {
			const percent = Math.min(100, Math.max(0, Math.floor((funding.raised * 100) / funding.goal)));
			const amount = new Intl.NumberFormat(t.locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
			progress = `<progress class="funding-bar" max="100" value="${percent}">${percent}%</progress>
		<p class="funding-progress">${t.funding.progress(amount.format(funding.raised), amount.format(funding.goal))}</p>`;
		}
		card = `<section class="funding" aria-labelledby="funding-title">
		<h2 id="funding-title">${t.funding.title}</h2>
		<p>${t.funding.text}</p>
		${progress}
		<a class="button primary" href="${escape(funding.url)}" target="_blank" rel="noopener noreferrer">${t.funding.button}</a>
	</section>`;
	}
	return layout(
		t,
		t.success.title,
		'done',
		`<div class="status">
	<svg class="status-icon success" viewBox="0 0 52 52" aria-hidden="true">
		<circle class="status-ring" cx="26" cy="26" r="23" pathLength="1"/>
		<path class="status-mark" d="M15 27l7 7 15-16" pathLength="1"/>
	</svg>
	<h1>${t.success.heading}</h1>
	<p class="lead">${t.success.lead}</p>
	${card}
	<a class="button secondary" href="/">${t.success.another}</a>
</div>`,
	);
}

/** The failure page, with one of the known messages or a provider's error text. */
export function failurePage(t: Messages, error?: { message?: ErrorMessage; text?: string }): string {
	const reason = [error?.message ? t.errors[error.message] : '', error?.text ? escape(error.text) : ''].filter(Boolean).join(' ');
	return layout(
		t,
		t.failure.title,
		'error',
		`<div class="status">
	<svg class="status-icon failure" viewBox="0 0 52 52" aria-hidden="true">
		<circle class="status-ring" cx="26" cy="26" r="23" pathLength="1"/>
		<path class="status-mark" d="M18 18l16 16M34 18L18 34" pathLength="1"/>
	</svg>
	<h1>${t.failure.heading}</h1>
	<p class="alert" role="alert">${reason}</p>
	<p class="lead">${t.failure.lead}</p>
	<a class="button primary" href="/">${t.failure.retry}</a>

	<details class="help">
		<summary>${t.help.summary}</summary>
		<ul>
			<li>${t.help.expired}</li>
			${forumLinks(t)}
		</ul>
	</details>
</div>`,
	);
}

// The companies users sign in with, by provider.
const SIGNIN_WITH: Record<string, string> = { googledrive: 'Google', onedrive: 'Microsoft', dropbox: 'Dropbox' };

/**
 * Answers the code form: forwards to the provider's sign-in page with a refresh instead of an HTTP redirect, so the
 * provider's page isn't the target of a form submission and the CSP can keep form-action 'self'.
 */
export function continuePage(t: Messages, provider: string, url: string): string {
	const name = SIGNIN_WITH[provider] ?? provider;
	return layout(
		t,
		t.continuing.title,
		null,
		`<div class="status">
	<p class="lead">${escape(t.continuing.text(name))}</p>
	<a class="button primary" href="${escape(url)}">${escape(t.continuing.link(name))}</a>
</div>`,
		`\n\t<meta http-equiv="refresh" content="0; url=${escape(url)}"/>`,
	);
}

export function tooManyPage(t: Messages): string {
	return simplePage(t, t.tooMany.title, t.tooMany.text);
}

export function notFoundPage(t: Messages): string {
	return simplePage(t, t.notFound.title, t.notFound.text);
}

function simplePage(t: Messages, title: string, text: string): string {
	return layout(
		t,
		title,
		null,
		`<div class="status">
	<h1>${title}</h1>
	<p class="lead">${text}</p>
	<a class="button primary" href="/">${t.failure.retry}</a>
</div>`,
	);
}

export function privacyPage(t: Messages): string {
	return layout(t, t.privacy.title, null, `<article class="prose">${t.privacy.body(SOURCE_URL)}</article>`);
}
