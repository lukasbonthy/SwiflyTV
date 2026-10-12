# Polished liquid glass catalog — v153

Continue Watching is rebuilt as a separate component with landscape artwork, captions below the image, a hover play control and a separate remove button. The homepage and full history page read the same watch history. Series links retain the saved season and episode.

Progress bars appear only when real elapsed time and duration are present. Legacy randomly generated percentages are ignored. The history styles use their own class names to avoid the old card padding that made progress bars oversized.

Row headings use plain View all links and aligned arrow buttons. Glass reflections and panel backgrounds are softer throughout the interface.

## Windows PowerShell setup

Extract the ZIP, then run these as separate commands in the extracted project folder:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

Set `TMDB_API_KEY` in `.env` to your own TMDB API key. For local Windows playback, also set:

```dotenv
SWIFLY_NO_ENV_MODE=false
PLAYWRIGHT_BROWSERS_PATH=0
CONSUMET_ENABLED=false
FILMU_ENABLED=false
REMOTE_BROWSER_ENABLED=true
PORT=3000
```

Install the browser and start the site:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "0"
npx playwright-core install chromium
npm start
```

Open http://localhost:3000. Use Ctrl+C to stop the server before replacing files. When updating an existing installation, keep your existing `.env`; the ZIP contains only `.env.example`. Dependencies are unchanged from v149. Refresh the browser with Ctrl+F5 after updating.

## Checks

`npm run check` checks the server and all four browser scripts. The restored release also receives local CSS parsing and mocked page, asset and browser interaction checks. Those checks do not establish live third party playback availability or pixel accuracy in a real browser.
