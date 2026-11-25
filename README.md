# Earthwire

A live map of what's happening around the world. Each dot on the map is a news headline. Click a dot to read it.

- **Open it:** serve the folder with any static server (for example `python3 -m http.server`) and visit `http://localhost:8000`, or turn on GitHub Pages for this branch.
- **News source:** the free [GDELT](https://www.gdeltproject.org/) news API, with English headlines from the last 24 hours, refreshed every 15 minutes. No API key needed.
- **Placement:** each headline is pinned to the city or country it mentions (`js/gazetteer.js`). If it names no place, the dot goes to the news outlet's country and is drawn hollow.
- **Topics:** dot colours come from keywords in the headline (`CATEGORIES` in `js/app.js`).
- **Offline:** if the feed can't be reached, the page shows headlines saved from your last visit. With nothing saved, it shows clearly labelled sample headlines.

Controls: scroll or pinch to zoom, drag to move, ← → to step through stories, Esc to close.

The map (`js/world.js`) comes from Natural Earth 1:50m data, simplified and drawn in the Equal Earth projection.
