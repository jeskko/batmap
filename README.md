# BatMUD World Map

An interactive, self-hosted map of the [BatMUD](https://www.bat.org/) game
world — a modern rebuild of an older Google Maps-based fan site, now running
on [Leaflet](https://leafletjs.com/) with a Python tile-generation pipeline
instead of PHP/Google Maps. Fully static once built: no backend, no
database, no accounts.

**Features**
- Zoomable terrain map (11 zoom levels) rendered from BatMUD's own world
  data, plus an optional retro "text map" layer showing the raw ASCII
  characters at the closest zooms
- Clustered location markers (cities, guilds, shrines, trainers, monsters,
  trade routes, ...), filterable by type and by continent, with search
- Toggleable marker name labels and trade-lane route lines
- Shareable links that capture position, zoom, and layer/toggle state
- Responsive layout with a collapsible sidebar for mobile

## How this was built

This project is vibe-coded: essentially the entire codebase — the Python
tile/data pipeline, the frontend, the build tooling, this README — was
written by [Claude Code](https://claude.com/claude-code) (Anthropic's AI
coding agent, running Claude models), directed conversationally. I described
what I wanted, reviewed and tested the result in a real browser each step,
and asked for fixes and changes when something was wrong or not what I
meant; I didn't hand-write or line-by-line review the code the way I would
for a fully hand-crafted project.

I'm saying this plainly rather than leaving it implicit, so you know what
you're looking at: the implementation choices, comments, and any bugs in
here reflect that process, not necessarily a deliberate hand-tuned design.
If something looks off, it probably just hasn't been looked at closely by
a human yet — issues and PRs pointing that out are welcome.

## Repository layout

```
utils/       Python pipeline that renders tiles + location/tradelane JSON
             from a maputils checkout (replaces the old tools/makegmaps.php)
www/         The static frontend (HTML/CSS/JS + vendored Leaflet) -- this is
             what actually gets deployed
extern/      Not committed; a Mercurial checkout of BatMUD's maputils data,
             fetched on demand by `make fetch-data` (see below)
Makefile     Orchestrates the above: fetch data -> render -> install
```

## Requirements

- Python 3.10+
- [Mercurial](https://www.mercurial-scm.org/) (`hg`) — only needed to fetch/update the map data in `extern/`
- `rsync`
- A way to serve static files (any web server, or `python3 -m http.server` for local testing)

Everything else (Pillow, NumPy) is installed automatically into a local
virtualenv (`.venv-utils/`) by the Makefile.

## Building

```sh
make update          # first run: clones maputils into extern/, then renders everything
make render          # rebuild tiles/data from whatever's already in extern/, no network access
```

`render` is safe to run repeatedly — it skips the (slow-ish, ~1-2 minutes)
tile rendering step entirely if nothing in `extern/` or `utils/` has changed
since the last build.

## Local development

```sh
make install WWW_DIR=www
cd www && python3 -m http.server 8000
```

Then open `http://localhost:8000/`. (`WWW_DIR=www` installs the generated
tiles/data directly into the source `www/` tree for convenience; see below
for real deployments.)

## Deploying

```sh
make install WWW_DIR=/var/www/batmap
```

This copies the static site plus generated tiles/data into `WWW_DIR`,
pointed at a web server's document root. **This is destructive** (`rsync
--delete`): anything already in `WWW_DIR` that isn't part of this build gets
removed, on the assumption that stale leftovers are far more likely than a
legitimate need to preserve them (the set of continents and their sizes has
been stable for well over a decade).

For a real deployment, copy `config.mk.example` to `config.mk` (gitignored)
and set `WWW_DIR` (and anything else you want to override) there instead of
passing it on the command line every time.

To pick up new map data later, just re-run `make update` and `make install`.

## License

The code in this repository is MIT-licensed — see [LICENSE](LICENSE).

That does **not** extend to everything in the repo, though:
- `www/img/batmud_logo2.png` and `www/img/wood2.jpg` are carried over from
  the original site for visual continuity and remain the property of their
  original owners.
- `www/vendor/leaflet/` and `www/vendor/markercluster/` are third-party
  libraries vendored as-is, each under its own license (included alongside
  them).
- BatMUD's world map data itself (fetched into `extern/`, and anything
  rendered from it into `www/tiles/`, `www/tiles-ascii/`, and `www/data/`)
  isn't part of this repository at all, and remains the property of BAT ry
  and its contributing area builders.

See [LICENSE](LICENSE) for the full detail.

## Credits

Map data by BAT ry, Ggr, Slobber & Jeskko. Original Google Maps-based site by
Jeskko & Ggr — its source lives in its own Mercurial repository at
[tnsp.org/hg/batmud/gmap2](https://tnsp.org/hg/batmud/gmap2/), not in this
repo. Built with [Leaflet](https://leafletjs.com/) and
[Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster).
