# Earthwire

### 🌍 [Open the website → cat7uu.github.io/When-they-re-cool-test](https://cat7uu.github.io/When-they-re-cool-test/)

A live map of what's happening around the world. Each dot on the map is a news headline. Click a dot to read it.

- **Open it:** go to https://cat7uu.github.io/When-they-re-cool-test/. To run it on your own computer instead, serve the folder with any static server (for example `python3 -m http.server`) and visit `http://localhost:8000`.
- **News source:** the free [GDELT](https://www.gdeltproject.org/) news API, with English headlines from the last 24 hours, refreshed every 15 minutes. No API key needed.
- **Placement:** each headline is pinned to the city or country it mentions (`js/gazetteer.js`). If it names no place, the dot goes to the news outlet's country and is drawn hollow.
- **Topics:** dot colours come from keywords in the headline (`CATEGORIES` in `js/app.js`).
- **Offline:** if the feed can't be reached, the page shows headlines saved from your last visit. With nothing saved, it shows clearly labelled sample headlines.

Controls: scroll or pinch to zoom, drag to move, ← → to step through stories, Esc to close.

The map (`js/world.js`) comes from Natural Earth 1:50m data, simplified and drawn in the Equal Earth projection.

## Security

The site has no logins, accounts or server, so the main risk is untrusted data from news feeds, GDELT and Yahoo Finance. Keep these rules when changing the code:

- **Treat every headline, link and number as untrusted.** Put text on the page with `textContent`, never `innerHTML`. Run links through `safeUrl()` (only `http`/`https`; images only `https`). The stocks file is checked by `validate()` in `js/stocks.js`.
- **Content Security Policy** (`<meta http-equiv="Content-Security-Policy">` in `index.html`) only allows scripts from this site and network requests to GDELT and `raw.githubusercontent.com`. If you add a data source, add it to `connect-src`. Don't add inline `<script>` blocks.
- **GitHub job** (`.github/workflows/headlines.yml`): never add `pull_request_target` or `pull_request` triggers, keep actions pinned to commit SHAs (Dependabot proposes updates), and give the token only to the steps that need it. The scripts clean and size-check data before saving, and `scripts/publish-data.sh` only publishes valid JSON.
- **Never commit API keys or passwords.** Nothing here needs one.

Recommended repo settings (GitHub → Settings):
- **Branches → Add branch protection rule** for `main`: block force pushes and deletion.
- **Actions → General → Workflow permissions:** "Read repository contents" (the headline job asks for write access itself).
- **Code security:** turn on Dependabot alerts and secret scanning.
