import type { SigninState } from './state';

/** Configuration: plain values in wrangler.jsonc ("vars"), client secrets as Worker secrets. See SETUP.md. */
export interface Env {
	// Public address of the service, e.g. https://drive.signinserver.com. The OAuth callback is SITE_URL/callback.
	SITE_URL: string;
	REQUIRE_HTTPS?: string;
	RATE_LIMIT_PIN?: string;
	RATE_LIMIT_SIGNIN?: string;
	RATE_LIMIT_REFRESH_IP?: string;
	RATE_LIMIT_REFRESH_TOKEN?: string;
	FUNDING_URL?: string;
	FUNDING_GOAL?: string;
	FUNDING_RAISED?: string;
	// PROVIDER_<NAME>_CLIENT_ID, _CLIENT_SECRET, _URL_AUTHORIZE, _URL_TOKEN, and optionally
	// PROVIDER_<NAME>_LEGACY_CLIENT_ID and _LEGACY_CLIENT_SECRET, for NAME GOOGLEDRIVE and ONEDRIVE.
	[name: `PROVIDER_${string}`]: string | undefined;
	// Usage counts (Workers Analytics Engine), and the token drive-login sends its summaries with. Both optional:
	// without them nothing is recorded. See src/usage.ts.
	USAGE?: AnalyticsEngineDataset;
	USAGE_REPORT_TOKEN?: string;
	// The private /usage page: the Cloudflare Access application that protects it (team domain, e.g.
	// myteam.cloudflareaccess.com, and the application's audience tag), and a read-only API token (Account
	// Analytics: Read) for the account's Analytics Engine. The page answers 404 until all four are set.
	ACCESS_TEAM_DOMAIN?: string;
	ACCESS_AUD?: string;
	ANALYTICS_ACCOUNT_ID?: string;
	USAGE_API_TOKEN?: string;
	STORE?: DurableObjectNamespace;
	ASSETS?: Fetcher;
}

type Async<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> | R : never };

/** SigninState's methods, called on the Durable Object in production or directly in tests. */
export type Store = Async<Pick<SigninState, 'createPin' | 'startSignin' | 'finishSignin' | 'storeTokens' | 'collect' | 'acquire' | 'firstToday'>>;
