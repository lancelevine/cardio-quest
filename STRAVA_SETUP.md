# Cardio Quest — Strava integration setup

The website is on GitHub Pages. **GitHub Pages cannot safely store a Strava client secret or exchange OAuth tokens.** This repository includes a Cloudflare Worker backend scaffold in `strava-worker.js`.

## Setup (one-time)
1. Register an application at https://www.strava.com/settings/api (Strava currently requires a subscription for new API applications).
2. Create a Cloudflare Worker, paste `strava-worker.js`, and create a Workers KV namespace bound as `SESSIONS`.
3. Configure Worker secrets `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `APP_ORIGIN` = `https://lancelevine.github.io`.
4. Set Worker variable `CALLBACK_URL` to `https://YOUR-WORKER.workers.dev/callback`.
5. In Strava API settings, set Authorization Callback Domain to your Worker hostname (without https:// or /callback).
6. In Cardio Quest, paste your Worker base URL into the Strava integration section, then connect.

**Never commit your Strava client secret, access token, or refresh token.** The Worker stores tokens in private KV, not GitHub. The initial scaffold is for personal testing, not production multi-user use. iOS third-party cookie restrictions can interrupt the OAuth session with this cross-origin design; a same-site custom domain or more robust authentication/session flow may be needed. Disconnect deletes the stored session, but does not revoke Strava authorization; revoke separately in Strava settings.

The integration imports recent runs and walks into your local activity history, without overwriting manual entries.
