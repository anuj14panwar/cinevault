# Cinevault

A streaming-style TV show browser (hero banner, scrolling rows, genre shelves, show details with cast, seasons and episodes, search, "Airing Today", and a saved "My List").

All data comes live from the free [TVmaze API](https://www.tvmaze.com/api). No API key, no backend, no build step — just three static files, so it runs on GitHub Pages as-is.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell (nav, main area, details modal, footer) |
| `style.css` | Dark streaming-style theme, responsive down to phones |
| `app.js` | Data fetching, routing (`#/`, `#/today`, `#/mylist`, `#/search?q=`), rendering |

## Run locally

Any static server works, for example:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Host on GitHub Pages

1. Create a new public repository on GitHub (e.g. `cinevault`).
2. Upload `index.html`, `style.css`, `app.js` and this README to the root of the repo (or `git push` them).
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`, then **Save**.
5. After a minute your site is live at `https://<your-username>.github.io/cinevault/`.

## Notes

- **Attribution:** TVmaze data is licensed CC BY-SA, which requires crediting TVmaze — the footer link does this; keep it.
- **Rate limit:** TVmaze allows about 20 requests per 10 seconds per IP. The app caches responses in memory to stay well under that.
- **No video:** TVmaze provides metadata and images only. The "Watch Trailer" button opens a YouTube search for the show's trailer.
- **My List** is stored in the visitor's browser (`localStorage`), so it's per-device.
- To use movies instead of TV, you could swap in TMDB's API — but it requires an API key, which would be visible in client-side code on GitHub Pages.
