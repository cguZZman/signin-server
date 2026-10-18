# Hosting your own sign-in service

This guide sets up your own instance of the sign-in service on Cloudflare Workers, so your Kodi add-ons sign in through a server you control, with your own Google and Microsoft OAuth apps. Cloudflare's free plan is enough for personal use (100,000 requests a day; each Kodi device makes about 24 a day).

You need:

- A Cloudflare account, and a domain whose DNS is on Cloudflare (the Worker gets a custom domain on it). Use a domain for this service only: the settings in step 3 apply to the whole domain.
- Node.js 22 or later.
- A Google Cloud project for Google Drive, a Microsoft Entra app registration for OneDrive, a Dropbox app for Dropbox, or any of them.

In the steps below, `https://login.example.com` stands for your service's address.

## 1. Create the OAuth apps

The service only needs the providers you want to use.

### Google Drive

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Under **Google Auth Platform**:
   - **Branding:** set the app name, a support email, your home page and privacy policy URLs (`https://login.example.com/` and `https://login.example.com/privacypolicy`), and add your domain under **Authorized domains** (you'll verify it in Google Search Console, easiest with a DNS TXT record in Cloudflare).
   - **Audience:** choose **External**.
   - **Data Access:** add the scope `https://www.googleapis.com/auth/drive.readonly`. It is the only scope the service requests.
   - **Clients:** create a client of type **Web application**, with the authorized redirect URI `https://login.example.com/callback`. Keep the client ID and client secret.
3. Decide the publishing status:
   - **Testing:** only the Google accounts you add as test users can sign in, and their sign-ins expire after 7 days (Google limits refresh tokens of apps in testing).
   - **In production without verification:** sign-ins don't expire, but users see a "Google hasn't verified this app" warning and the app is limited to 100 users. This is usually the right choice for personal or family use.
   - **Verified:** needed for public use. `drive.readonly` is a restricted scope, so Google's review is extensive and includes a yearly security assessment.

### OneDrive

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/), go to **App registrations → New registration**.
   - **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts" (needed for personal OneDrive).
   - **Redirect URI:** platform **Web**, `https://login.example.com/callback`.
2. **Certificates & secrets → New client secret.** Copy the value (not the ID). Client secrets expire (at most after 24 months), so note when to renew it.
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions:** `Files.Read.All`, `Sites.Read.All`, `User.Read` and `offline_access`.

### Dropbox

1. In the [Dropbox App Console](https://www.dropbox.com/developers/apps), create an app: **Scoped access**, **Full Dropbox**. Its name can't contain "Dropbox".
2. **Permissions:** `account_info.read`, `files.metadata.read` and `files.content.read`.
3. **Settings → OAuth 2 → Redirect URIs:** `https://login.example.com/callback`. Keep the **App key** and **App secret**.
4. New apps are in development status: up to 500 users can link them (click **Enable additional users** to allow others than you). Apply for production when you need more.

## 2. Configure the Worker

Clone this repository and install the tools:

```bash
npm install
npx wrangler login
```

Edit `wrangler.jsonc`:

- `name`: a name for your Worker.
- `routes`: your domain, e.g. `{ "pattern": "login.example.com", "custom_domain": true }`. Cloudflare creates the DNS record and certificate. Remove the second route unless you also want another domain that redirects to the first.
- `vars`:

| Variable | Value |
|---|---|
| `SITE_URL` | `https://login.example.com`. The OAuth callback is `SITE_URL/callback`; requests to any other host name of the Worker redirect here. |
| `PROVIDER_GOOGLEDRIVE_CLIENT_ID` | Your Google client ID (empty if you don't use Google Drive) |
| `PROVIDER_ONEDRIVE_CLIENT_ID` | Your Entra application (client) ID (empty if you don't use OneDrive) |
| `PROVIDER_DROPBOX_CLIENT_ID` | Your Dropbox app key (empty if you don't use Dropbox) |
| `PROVIDER_*_URL_AUTHORIZE`, `PROVIDER_*_URL_TOKEN` | Already set to Google's and Microsoft's endpoints. |
| `FUNDING_URL`, `FUNDING_GOAL`, `FUNDING_RAISED` | Optional donation card on the success page. Leave `FUNDING_URL` empty to hide it. |

Optional vars, with their defaults:

| Variable | Default | Effect |
|---|---|---|
| `RATE_LIMIT_PIN` | `10` | `POST /pin` requests per minute per IP. |
| `RATE_LIMIT_SIGNIN` | `20` | `/authorize` and `/signin/*` requests per minute per IP. |
| `RATE_LIMIT_REFRESH_IP` | `60` | `POST /refresh` requests per minute per IP. |
| `RATE_LIMIT_REFRESH_TOKEN` | `10` | `POST /refresh` requests per minute per refresh token (counted by hash). |

Set a rate limit to `0` to disable it.

Store the client secrets as encrypted Worker secrets, never in `wrangler.jsonc`:

```bash
npx wrangler secret put PROVIDER_GOOGLEDRIVE_CLIENT_SECRET
npx wrangler secret put PROVIDER_ONEDRIVE_CLIENT_SECRET
npx wrangler secret put PROVIDER_DROPBOX_CLIENT_SECRET
```

### Moving from another OAuth app

Refresh tokens only work with the app that issued them. If your users signed in through a previous app (for example an earlier deployment), add its credentials as the legacy app, and their sign-ins keep working:

```bash
npx wrangler secret put PROVIDER_ONEDRIVE_LEGACY_CLIENT_ID
npx wrangler secret put PROVIDER_ONEDRIVE_LEGACY_CLIENT_SECRET
```

A refresh is tried with the current app first, and with the legacy app when the current one rejects the token. New sign-ins always use the current app.

## 3. Cloudflare settings for the domain

In the Cloudflare dashboard, for your domain:

- **Security → Settings → Browser Integrity Check: off.** It blocks requests whose user agent looks like a script, and the add-ons use Python's default one (`Python-urllib`), so Kodi would get error 1010 instead of a sign-in code. It runs before the Worker, so the Worker can't let these requests through.
- Leave **Bot Fight Mode** off, for the same reason.

The Worker redirects plain HTTP to HTTPS itself. IPv6 stays on (the Free plan can't turn it off): the service pairs IPv4 clients by address and IPv6 clients by network (/64), and current add-on versions report both networks of the Kodi device.

## 4. Deploy

```bash
npm test
npx wrangler deploy
```

Open `https://login.example.com`. The Worker logs only its own warnings (no tokens, no IP addresses); see them under **Workers & Pages → your Worker → Logs**.

### Usage statistics (optional)

The Worker counts sign-ins, refreshes (and which app answered), daily active accounts, errors, countries and the add-on and Kodi versions in [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) (dataset `signin_usage`, free up to 100,000 events a day, kept three months). Nothing identifying is recorded: see `src/usage.ts` and the privacy policy. Remove the `analytics_engine_datasets` entry from `wrangler.jsonc` to turn it off.

To read the counts, create an API token under **My Profile → API Tokens** with **Account → Account Analytics → Read**, and run:

```bash
mkdir -p ~/.config/cloudflare && chmod 700 ~/.config/cloudflare
(umask 077; read -rsp 'Token: ' t && echo "$t" > ~/.config/cloudflare/usage-token)
echo <account ID> > ~/.config/cloudflare/account-id
node scripts/usage-report.mjs 7
```

The same report is a private page at `/usage` (charts and tables, last 7, 30 or 90 days), behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/):

1. In **Zero Trust → Access → Applications**, add a **Self-hosted** application for your domain with path `usage`, and a policy that allows only your email (one-time PIN login).
2. Put the team domain (`<team>.cloudflareaccess.com`, under **Settings → Custom pages** or in the login URL) and the application's **Audience (AUD) tag** in `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`), with your account ID in `ANALYTICS_ACCOUNT_ID`.
3. Give the Worker a read-only token: `npx wrangler secret put USAGE_API_TOKEN` (Account Analytics: Read).

The Worker also checks the Access login token itself, so the page stays closed if the Access application is removed. Until all four are set, `/usage` answers 404.

#### Google's Drive API counts on /usage (optional)

`/usage` can also show how many Drive API requests Kodi devices make with the tokens each Google project's app issued, read from Google Cloud Monitoring by a service account that can only read monitoring data:

```bash
A=<your Google account>; P=<project that holds the service account>
gcloud services enable iam.googleapis.com --project $P --account $A
gcloud iam service-accounts create usage-metrics --project $P --account $A --display-name "Usage page (read-only monitoring)"
# For each Google project of the add-on:
gcloud projects add-iam-policy-binding <project> --account $A --member serviceAccount:usage-metrics@$P.iam.gserviceaccount.com --role roles/monitoring.viewer --condition=None
# The key goes straight into the Worker secret, without being saved anywhere:
gcloud iam service-accounts keys create /dev/stdout --iam-account usage-metrics@$P.iam.gserviceaccount.com --account $A 2>/dev/null | npx wrangler secret put GOOGLE_METRICS_KEY
```

Then list the projects in `GOOGLE_METRICS_PROJECTS` in `wrangler.jsonc`, naming which app each one is: `old:<project>,new:<project>`. Without both, the page leaves Google out. `scripts/usage-report.mjs` doesn't show these counts (the key only exists in the Worker).

An older sign-in server can send hourly summaries to `POST /ingest/usage` (as drive-login does). Set the same random token on both:

```bash
npx wrangler secret put USAGE_REPORT_TOKEN
```

## 5. Run it locally

Useful to try your OAuth apps before deploying. Register `http://localhost:8787/callback` as an additional redirect URI with each provider (both allow plain HTTP for `localhost`), copy `.dev.vars.example` to `.dev.vars`, fill in the client IDs and secrets, and run:

```bash
npx wrangler dev --local-upstream localhost:8787
```

Kodi on the same machine can use `http://localhost:8787` as its sign-in server.

## 6. Point the Kodi add-ons at your server

In Kodi, open the settings of the Google Drive or OneDrive add-on, go to **Advanced → Sign-in Server**, and enter your server's address (for example `https://login.example.com`). Then add your account again from the add-on.

The phone or computer you sign in with must be on the same network as the Kodi device, because the service pairs them by public IP address.

## 7. Adapt the pages to your instance

The pages describe the public instance. Before others use yours, review:

- `src/messages/en.ts`, `es.ts` and `pt.ts`: the page texts and the privacy policy in each language (who runs the service and how to contact you; Google and Microsoft review the privacy policy if you publish your apps).
- `src/pages.ts`: the source code link (`SOURCE_URL`) and the app name, which should match the name on your OAuth consent screens.

The page language follows the browser's `Accept-Language` (English, Spanish or Portuguese, English by default); `?lang=en` forces one for a page. To add a language, add a file to `src/messages/` and list it in `src/i18n.ts`: the type checker reports any missing text.

## Endpoints

| Endpoint | Used by | Purpose |
|---|---|---|
| `POST /pin` | Kodi | Create a sign-in code |
| `GET /pin/{code}` | Kodi | Collect the tokens once the sign-in is done |
| `POST /refresh` | Kodi | Refresh an access token |
| `GET /ip` | Kodi | Show the public IP the service sees (troubleshooting) |
| `GET /`, `POST /authorize`, `GET /signin/{code}` | Browser | Enter the code (form or QR link) and go to the provider |
| `GET` or `POST /callback` | Provider | Return from the sign-in |
| `GET /privacypolicy` | Browser | Privacy policy |
| `POST /ingest/usage` | drive-login | Usage summaries from the older sign-in server (bearer token) |
