# KING Arkveld Overview (public site starter)

An unofficial fan-made static site for browsing reviewed KING Arkveld action names and derivation relationships.

This directory is intentionally separate from the local research workspace. It contains a small site shell and a public-data example only. It does **not** contain the full Overview HTML, C2/Atlas inputs, raw addresses, request GUIDs, call stacks, timer tables, probe logs, or spreadsheets.

## Local preview

Serve this directory over HTTP (the page fetches its public JSON data):

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Browser smoke test

With Node.js 22+ and Microsoft Edge installed, run `node tests/smoke_browser.js`.
The test starts its own local server and checks names, search, empty derivation messaging,
relationship rendering with temporary test data, and click-to-load video controls.
It does not certify MP4 playback until actual media has been added.
Set `PUBLIC_SITE_BROWSER` to use another Chromium executable.
In this restricted local environment, the verified invocation used Chrome with
`PUBLIC_SITE_BROWSER_NO_SANDBOX=1`; that switch applies only to this test process,
not to the website or visitors' browsers.

## GitHub Pages

The site is plain HTML, CSS, JavaScript, JSON, and optional media. For a user or organization Pages site, publish the repository root from the default branch. For a project site, publish the root or `/docs` folder according to the repository's Pages settings. Keep the repository private while reviewing; publishing Pages from a private repository depends on the account's GitHub plan and Pages visibility settings.

Before changing the repository to public, inspect every tracked file and the commit history. Removing a file in a later commit does not remove it from earlier public Git history.

## Public data boundary

Only place reviewed, intentionally public material here. The data schema is for user-facing action codes, Chinese labels, high-level derivation links, and evidence categories. Do not copy the internal research index into this site. The action list currently contains UI examples only; no derivation claims have been imported.

The included names are examples supplied for the interface. The game and its names remain the property of their respective owners. This fan project is not affiliated with or endorsed by Capcom.

## Demonstration media

The UI loads an MP4 only after the visitor asks to play it. Prefer short, silent, self-recorded gameplay captures, encoded as H.264 MP4, and keep a static poster available. Do not extract animation/video assets from game archives. Media placed in this repository is publicly downloadable; GitHub Pages is static hosting, not protected streaming.

See `media/README.md` for the proposed media format and file layout.
