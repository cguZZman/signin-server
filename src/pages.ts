// The HTML pages. Same look and texts as drive-login's templates; styles and script are in public/.

export const SOURCE_URL = 'https://github.com/cguZZman/signin-server';
const APP_NAME = 'Cloud Drive Sign-in for Kodi';

export const MESSAGES = {
	'error.pin.invalid':
		"That code didn't work. Check it matches the one on your TV, and that this device is on the same network as Kodi.",
	'failure.denied': 'Access was not granted. Kodi needs your permission to read your files.',
	'failure.code.1': 'Your code is no longer valid.',
	'failure.code.2': "Couldn't get authorization from the provider. Your account may not have a drive.",
	'failure.code.3': 'The sign-in request was invalid.',
	'failure.code.4':
		'This sign-in was finished in a different browser from the one that started it. Start again from Kodi and finish in the same browser.',
} as const;

export type Message = keyof typeof MESSAGES;

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

function steps(state: State): string {
	if (state === null) {
		return '';
	}
	const step = (number: number, label: string, className: string, current: boolean) =>
		`<li class="step${className ? ` ${className}` : ''}"${current ? ' aria-current="step"' : ''}>` +
		`<span class="step-dot" aria-hidden="true">${number}</span><span>${label}</span></li>`;
	return `<ol class="steps" aria-label="Sign-in progress">
				${step(1, 'Enter code', state === 'code' ? 'current' : 'complete', state === 'code')}
				${step(2, 'Sign in', state === 'done' ? 'complete' : state === 'error' ? 'failed' : '', state === 'error')}
				${step(3, 'Back to Kodi', state === 'done' ? 'complete current' : '', state === 'done')}
			</ol>`;
}

function layout(title: string, state: State, content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8"/>
	<meta name="viewport" content="width=device-width, initial-scale=1"/>
	<meta name="color-scheme" content="light dark"/>
	<title>${escape(title)} · ${APP_NAME}</title>
	<link rel="icon" href="/favicon.ico"/>
	<link rel="stylesheet" href="/css/app.css"/>
	<script src="/js/app.js" defer></script>
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
			${steps(state)}
			${content}
		</div>

		<footer class="footer">
			<nav class="footer-links">
				<a href="/privacypolicy">Privacy policy</a>
				<a href="${SOURCE_URL}">Source code</a>
			</nav>
			<p>Not affiliated with or endorsed by Team Kodi, Google or Microsoft.</p>
		</footer>
	</main>
</body>
</html>
`;
}

const FORUM_LINKS = `<li>
				<span>Still stuck? Ask in the support forum:</span>
				<a href="https://forum.kodi.tv/showthread.php?tid=324784">Google Drive</a> ·
				<a href="https://forum.kodi.tv/showthread.php?tid=228443">OneDrive</a>
			</li>`;

const EXPIRED_HELP = '<li>Codes expire after a few minutes. If yours expired, start the sign-in again in Kodi.</li>';

export function indexPage(sourceId: string, pin = '', error?: Message): string {
	const invalid = error ? ' aria-invalid="true" aria-describedby="pin-error"' : '';
	return layout(
		'Enter your code',
		'code',
		`<h1>Connect Kodi to your cloud drive</h1>
	<p class="lead">Enter the code shown on your TV. You'll then sign in with Google or Microsoft.</p>

	<form class="code-form" method="post" action="/authorize">
		<label class="visually-hidden" for="pin">Code from your TV</label>
		<div class="code-field">
			<input id="pin" name="pin" type="text" required autofocus
				maxlength="6" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"
				value="${escape(pin)}" placeholder="A1B2C3"${invalid}/>
			<div class="code-boxes" aria-hidden="true">
				<span class="code-box"></span><span class="code-box"></span><span class="code-box"></span>
				<span class="code-box"></span><span class="code-box"></span><span class="code-box"></span>
			</div>
		</div>
		${error ? `<p id="pin-error" class="alert" role="alert">${escape(MESSAGES[error])}</p>` : ''}
		<button class="button primary block" type="submit">Continue</button>
	</form>

	<details class="help">
		<summary>Having trouble?</summary>
		<ul>
			<li>Use a phone or computer on the same network (Wi-Fi) as your Kodi device.</li>
			${EXPIRED_HELP}
			<li><span>Your source id is</span> <strong>${escape(sourceId)}</strong>. <span>It should match one of the source ids shown in Kodi.</span></li>
			${FORUM_LINKS}
		</ul>
	</details>`,
	);
}

export interface Funding {
	url: string;
	goal: number;
	raised: number;
}

export function successPage(funding: Funding | null): string {
	let card = '';
	if (funding) {
		let progress = '';
		if (funding.goal > 0) {
			const percent = Math.min(100, Math.max(0, Math.floor((funding.raised * 100) / funding.goal)));
			const amount = (n: number) => `$${n.toLocaleString('en-US')}`;
			progress = `<progress class="funding-bar" max="100" value="${percent}">${percent}%</progress>
		<p class="funding-progress">${amount(funding.raised)} of ${amount(funding.goal)} raised this year</p>`;
		}
		card = `<section class="funding" aria-labelledby="funding-title">
		<h2 id="funding-title">Help keep this sign-in working</h2>
		<p>This free sign-in server is run by one developer. Hosting costs money, and Google requires a paid security assessment every year to keep Google Drive sign-in working. If the add-on is useful to you, please consider chipping in.</p>
		${progress}
		<a class="button primary" href="${escape(funding.url)}" target="_blank" rel="noopener noreferrer">Support the project</a>
	</section>`;
	}
	return layout(
		'Signed in',
		'done',
		`<div class="status">
	<svg class="status-icon success" viewBox="0 0 52 52" aria-hidden="true">
		<circle class="status-ring" cx="26" cy="26" r="23" pathLength="1"/>
		<path class="status-mark" d="M15 27l7 7 15-16" pathLength="1"/>
	</svg>
	<h1>You're signed in</h1>
	<p class="lead">Kodi will finish adding your account in a few seconds. You can close this page.</p>
	${card}
</div>`,
	);
}

/** The failure page, with one of the known messages or a provider's error text. */
export function failurePage(error?: { message?: Message; text?: string }): string {
	const reason = [error?.message ? MESSAGES[error.message] : '', error?.text ?? ''].filter(Boolean).map(escape).join(' ');
	return layout(
		'Sign-in failed',
		'error',
		`<div class="status">
	<svg class="status-icon failure" viewBox="0 0 52 52" aria-hidden="true">
		<circle class="status-ring" cx="26" cy="26" r="23" pathLength="1"/>
		<path class="status-mark" d="M18 18l16 16M34 18L18 34" pathLength="1"/>
	</svg>
	<h1>Sign-in didn't complete</h1>
	<p class="alert" role="alert">${reason}</p>
	<p class="lead">Start the sign-in again from Kodi to get a new code.</p>
	<a class="button primary" href="/">Enter a new code</a>

	<details class="help">
		<summary>Having trouble?</summary>
		<ul>
			${EXPIRED_HELP}
			${FORUM_LINKS}
		</ul>
	</details>
</div>`,
	);
}

export function tooManyPage(): string {
	return simplePage('Too many attempts', 'Please wait a minute and try again.');
}

export function notFoundPage(): string {
	return simplePage('Page not found', "There's nothing at this address.");
}

function simplePage(title: string, text: string): string {
	return layout(
		title,
		null,
		`<div class="status">
	<h1>${escape(title)}</h1>
	<p class="lead">${escape(text)}</p>
	<a class="button primary" href="/">Enter a new code</a>
</div>`,
	);
}

export function privacyPage(): string {
	return layout(
		'Privacy policy',
		null,
		`<article class="prose">
	<h1>Privacy policy</h1>
	<p class="meta">Last updated: October 10, 2026</p>

	<p>
		This policy covers the <strong>Google Drive</strong> and <strong>OneDrive</strong> add-ons for Kodi and this sign-in service.
		They are open-source projects developed and run by Carlos Guzman (cguZZman). They are not affiliated with or
		endorsed by Team Kodi, Google or Microsoft.
	</p>

	<h2>In short</h2>
	<ul>
		<li>The add-ons only <strong>read</strong> your files so you can browse and play them in Kodi. They never change or delete anything.</li>
		<li>Your files go directly between your Kodi device and Google or Microsoft. They never pass through this server.</li>
		<li>This server only helps your Kodi device sign in. It keeps sign-in data in memory for at most 3 minutes and never stores it.</li>
		<li>Nothing is sold, shared with third parties, or used for advertising.</li>
	</ul>

	<h2>What the add-ons access, and why</h2>
	<h3>Google Drive</h3>
	<dl class="scopes">
		<dt><code>drive.readonly</code> See and download your Google Drive files</dt>
		<dd>List your folders, shared drives and files, and stream or show them in Kodi. The add-on also reads your Drive account name through this permission, to show it in the Kodi menu. Read-only access.</dd>
	</dl>
	<h3>OneDrive</h3>
	<dl class="scopes">
		<dt><code>Files.Read.All</code></dt>
		<dd>List and play your OneDrive files, including files shared with you. Read-only access.</dd>
		<dt><code>Sites.Read.All</code></dt>
		<dd>List and play files in SharePoint document libraries (work or school accounts). Read-only access.</dd>
		<dt><code>User.Read</code></dt>
		<dd>Show your account name in the Kodi menu.</dd>
		<dt><code>offline_access</code></dt>
		<dd>Stay signed in without asking you to sign in again every hour.</dd>
	</dl>

	<h2>How your data flows</h2>
	<h3>Your files</h3>
	<p>
		File names, folders, thumbnails and file contents are requested by your Kodi device directly from Google or Microsoft and are
		only used to display and play them in Kodi. They never pass through this server.
	</p>
	<h3>Signing in</h3>
	<p>
		When you enter the code from your TV, this server sends you to Google or Microsoft to sign in. After you approve, the provider
		sends this server a one-time authorization code. The server exchanges it for access and refresh tokens and holds them
		<strong>in memory</strong> until your Kodi device collects them, at most 3 minutes later. They are then deleted. Tokens
		are never written to disk or to logs.
	</p>
	<p>
		While you sign in, the server sets one temporary cookie in your browser. It makes sure the sign-in is finished in the same
		browser that started it, so nobody can trick you into approving a sign-in for their device. It is removed when the sign-in
		completes and expires after 5 minutes at most. It is not used for anything else.
	</p>
	<p>
		To make sure the code is entered from the same network as your Kodi device, the server keeps your public IP address in
		memory together with the code, also for at most 3 minutes.
	</p>
	<h3>Staying signed in</h3>
	<p>
		About once an hour, your Kodi device sends its refresh token to this server. The server adds the application's credentials,
		forwards the request to Google or Microsoft, and returns the new access token to your device. It does not keep or log the
		tokens.
	</p>
	<h3>Abuse protection</h3>
	<p>
		To protect the service, the server counts requests per IP address, and token refreshes per one-way hash of the refresh
		token. These counters are kept in memory for one minute and are never stored.
	</p>
	<h3>Hosting</h3>
	<p>
		This server runs on Cloudflare Workers. Cloudflare receives every request, including your IP address, in order to deliver
		it, under the <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy policy</a>. Request logs are turned
		off for this service: the only log it keeps is its own error messages (for example, that a token request failed and the
		provider's error code), which never contain tokens or IP addresses and are deleted by Cloudflare after a few days.
	</p>

	<h2>What is stored on your Kodi device</h2>
	<p>
		For each account, the add-ons store your account ID, account name, the list of your drives, and the access and refresh tokens.
		These are kept in the add-on's data folder on your Kodi device, together with a temporary cache of folder listings that
		expires after a few minutes (5 by default, configurable in the add-on settings).
	</p>

	<h2>How your data is protected</h2>
	<p>Google user data and sign-in tokens are sensitive, and are protected as follows:</p>
	<ul>
		<li><strong>Encryption in transit:</strong> all traffic between your browser, your Kodi device, this server, Google and Microsoft uses HTTPS (TLS). This server only accepts HTTPS and tells browsers to never use plain HTTP (HSTS).</li>
		<li><strong>Data minimization:</strong> only read-only access is requested. This server never requests your files or their details, and keeps no database of users, accounts or Google user data.</li>
		<li><strong>Token handling:</strong> on this server, tokens exist only in memory, for at most 3 minutes during sign-in or for the duration of a refresh request. They are never written to disk, to a database or to logs. On your Kodi device, the add-ons remove tokens from everything they write to the Kodi log.</li>
		<li><strong>Access control:</strong> a sign-in code can only be used from the same network as the Kodi device that requested it, must be finished in the same browser that started it (a one-time cookie and PKCE), and the resulting tokens can only be collected with a random secret known only to that Kodi device. Codes expire after 3 minutes and work once. Requests are rate-limited to prevent abuse.</li>
		<li><strong>Application credentials:</strong> the client secrets are kept in the hosting provider's encrypted secret storage, not in the source code.</li>
		<li><strong>No human access:</strong> nobody, including the developer, can see your files or tokens through this service.</li>
		<li><strong>Open source:</strong> the add-ons and this server are open source, so how they handle data can be reviewed by anyone.</li>
	</ul>

	<h2>Retention and deletion of Google user data</h2>
	<ul>
		<li><strong>On this server:</strong> no Google user data is retained. Sign-in tokens are deleted as soon as your Kodi device collects them, and at most 3 minutes after the sign-in started. Refresh requests are passed to Google and answered without keeping anything.</li>
		<li><strong>On your Kodi device:</strong> your account ID, name, drive list and tokens stay on your device until you remove the account in the add-on. Cached folder listings expire after a few minutes.</li>
		<li><strong>Deleting your data:</strong> remove the account in Kodi (open the add-on, bring up the context menu on the account, and choose to remove it). This deletes its tokens and account data from your device. Uninstalling the add-on and deleting its data folder removes everything it stored.</li>
		<li>
			<strong>Revoking access:</strong> you can revoke the add-on's access at any time in your
			<a href="https://myaccount.google.com/permissions">Google account permissions</a>,
			<a href="https://account.live.com/consent/Manage">Microsoft personal account</a> or
			<a href="https://myapplications.microsoft.com/">Microsoft work or school account</a>. The tokens stop working immediately.
		</li>
		<li>Because this server keeps no data about you, there is nothing to delete on the server. If you have questions about your data, use the contact below.</li>
	</ul>

	<h2>Error reports</h2>
	<p>
		The add-ons do not send error reports. Errors are only written to the Kodi log on your device, with tokens removed.
		Older add-on versions had an optional <em>Report errors</em> setting; this service does not accept or store those reports.
	</p>

	<h2>Google API Services</h2>
	<p>
		The use and transfer of information received from Google APIs adheres to the
		<a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
		including the Limited Use requirements. Google user data is never sold, used for advertising, transferred to third parties,
		or used to train AI models.
	</p>

	<h2>Donations</h2>
	<p>
		If you choose to support the project, the donation is handled by the donation platform under its own privacy policy. Donations
		are not linked to your Kodi accounts.
	</p>

	<h2>Contact</h2>
	<p>
		Questions about this policy: open an issue at
		<a href="${SOURCE_URL}/issues">${SOURCE_URL.replace('https://', '')}</a>.
	</p>
</article>`,
	);
}
