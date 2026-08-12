# Old-site permalink compatibility shim

`index.php` here is a drop-in replacement for the old gmap2 site's
`index.php` (https://tnsp.org/hg/batmud/gmap2/). It converts old permalink
query params to the new site's equivalent and redirects there.

It contains **no PHP code** (no `<?php` tags) — it's plain HTML + JS
served under a `.php` name purely so it keeps working at the exact same
URL old links point to. `index.html` is an identical copy, for previewing
locally without needing a PHP-capable server.

## Deploying

This is **not** part of `make install` — gmap2/ lives in a separate
directory on the same webhost (per the task that produced this: old site
at `/gmap2/`, new site at `/map/`), outside this repo's own build/deploy
output. Deploy it by hand:

```
cp www/compat/index.php  <webhost>/gmap2/index.php
```

That's it — no other gmap2 files need to change.

## What it converts

Old permalinks only ever came in two (optionally combined) shapes — see
`old/gmap2/index.php`'s `$jsTokens` and `old/gmap2/map.js`'s
`pmapMakeLink()`/`pmapInitializeMap()` (not part of this repo; a local,
gitignored checkout of the old site):

```
/gmap2/index.php?x=<int>&y=<int>&zoom=<int>
/gmap2/index.php?name=<string>&token=<string>[&x=..&y=..&zoom=..]
```

- `x`, `y` — pass through unchanged. The old site's permalink coordinates
  were always in its fixed "zoom level 6" pixel space, which is exactly
  the new site's native/Leaflet-zoom-0 pixel space (see
  `www/js/coords.js`'s `NATIVE_ZOOM_OFFSET`) — same coordinate system,
  no math needed.
- `zoom` — shifted by `-6` (`NATIVE_ZOOM_OFFSET`) to convert from the old
  site's Google Maps-style zoom numbering to the new site's Leaflet zoom
  numbering. Only carried over when `x`/`y` are also present, matching the
  old site's own combined guard.
- `name`, `token` — passed through unchanged (same param names, same
  meaning on both sites — including `token` being inert on both; see
  `www/js/playermarker.js`'s own doc comment). Only carried over when both
  are present, matching the old site's own combined guard.
- Anything else (e.g. the old site's unrelated `css` stylesheet-picker
  param) is dropped.
- `labels=1` and `ascii=1` are added unconditionally to every generated
  link (including the no-JS `<noscript>` fallback). The old site always
  showed marker text labels — every marker used the `MarkerWithLabel`
  plugin with no toggle to turn it off (`old/gmap2/markers.js`) — and the
  text/ASCII map layer is turned on to match the old site's default look
  too. The new site defaults both off, so without this a converted link
  would look sparser than the page it replaced.

If `NATIVE_ZOOM_OFFSET` in `www/js/coords.js` ever changes, update the
matching constant in `index.php` here too.
