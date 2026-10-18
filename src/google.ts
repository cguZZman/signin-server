// Drive API request counts from Google Cloud Monitoring, for the /usage page. A service account with the Monitoring
// Viewer role on the Google projects (its JSON key in GOOGLE_METRICS_KEY) gets an access token with a signed JWT
// (OAuth 2.0 JWT bearer grant) and reads serviceruntime.googleapis.com/api/request_count for drive.googleapis.com:
// requests made by Kodi devices with the tokens each project's app issued. See SETUP.md.
import type { DriveCount, DriveMetrics } from './report';

interface ServiceAccountKey {
	client_email: string;
	private_key: string;
	token_uri?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/monitoring.read';
const MONITORING = 'https://monitoring.googleapis.com/v3';
const RESULTS_TTL_MS = 5 * 60 * 1000;

let token: { email: string; value: string; expires: number } | null = null;
const results = new Map<string, { at: number; counts: DriveCount[] }>();

/** Forgets the access token and cached results (tests). */
export function clearGoogleCaches(): void {
	token = null;
	results.clear();
}

/**
 * Daily Drive API request counts per project, by method and response code. `projects` names each project's app:
 * "old:project-id,new:project-id". Results are kept for a few minutes, so reloading the page doesn't query again.
 */
export function driveMetrics(keyJson: string, projects: string, now = () => Date.now()): DriveMetrics {
	const apps = projects
		.split(',')
		.map((entry) => entry.trim().split(':'))
		.filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0] && !!parts[1])
		.map(([app, project]) => ({ app, project }));
	return async (start, end) => {
		const cacheKey = `${start}|${end}|${projects}`;
		const cached = results.get(cacheKey);
		if (cached && now() - cached.at < RESULTS_TTL_MS) {
			return cached.counts;
		}
		const access = await accessToken(JSON.parse(keyJson) as ServiceAccountKey, now());
		const counts = (await Promise.all(apps.map(({ app, project }) => projectCounts(access, project, app, start, end)))).flat();
		if (results.size > 20) {
			results.clear();
		}
		results.set(cacheKey, { at: now(), counts });
		return counts;
	};
}

async function projectCounts(access: string, project: string, app: string, start: string, end: string): Promise<DriveCount[]> {
	const counts: DriveCount[] = [];
	let pageToken = '';
	do {
		const params = new URLSearchParams({
			filter:
				'metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.type="consumed_api" AND resource.labels.service="drive.googleapis.com"',
			'interval.startTime': `${start}T00:00:00Z`,
			// Daily buckets end at this time, so ending at midnight UTC makes them UTC days.
			'interval.endTime': `${nextDay(end)}T00:00:00Z`,
			'aggregation.alignmentPeriod': '86400s',
			'aggregation.perSeriesAligner': 'ALIGN_SUM',
			'aggregation.crossSeriesReducer': 'REDUCE_SUM',
		});
		params.append('aggregation.groupByFields', 'resource.labels.method');
		params.append('aggregation.groupByFields', 'metric.labels.response_code');
		if (pageToken) {
			params.set('pageToken', pageToken);
		}
		const response = await fetch(`${MONITORING}/projects/${encodeURIComponent(project)}/timeSeries?${params}`, {
			headers: { Authorization: `Bearer ${access}` },
		});
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`Cloud Monitoring answered ${response.status} for ${project}: ${text.slice(0, 200)}`);
		}
		const data = JSON.parse(text) as {
			timeSeries?: {
				metric?: { labels?: Record<string, string> };
				resource?: { labels?: Record<string, string> };
				points?: { interval: { startTime: string }; value: { int64Value?: string } }[];
			}[];
			nextPageToken?: string;
		};
		for (const series of data.timeSeries ?? []) {
			const method = series.resource?.labels?.method ?? '';
			const code = series.metric?.labels?.response_code ?? '';
			for (const point of series.points ?? []) {
				const n = Number(point.value.int64Value ?? 0);
				if (n > 0) {
					counts.push({ app, day: point.interval.startTime.slice(0, 10), method, code, n });
				}
			}
		}
		pageToken = data.nextPageToken ?? '';
	} while (pageToken);
	return counts;
}

async function accessToken(key: ServiceAccountKey, now: number): Promise<string> {
	if (token && token.email === key.client_email && token.expires - 60_000 > now) {
		return token.value;
	}
	const audience = key.token_uri ?? 'https://oauth2.googleapis.com/token';
	const issued = Math.floor(now / 1000);
	const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
	const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: key.client_email, scope: SCOPE, aud: audience, iat: issued, exp: issued + 3600 })}`;
	const signingKey = await crypto.subtle.importKey('pkcs8', pemBytes(key.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
	const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(unsigned)));
	const response = await fetch(audience, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64Url(signature)}` }),
	});
	const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
	if (!response.ok || !data.access_token) {
		throw new Error(`Google token request failed: ${response.status} ${data.error ?? ''} ${data.error_description ?? ''}`.trim());
	}
	token = { email: key.client_email, value: data.access_token, expires: now + (data.expires_in ?? 3600) * 1000 };
	return token.value;
}

function pemBytes(pem: string): Uint8Array {
	const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
	return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

function base64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nextDay(day: string): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
