"""
CLI entrypoint: builds tiles + markers/tradelane JSON from an extern/maputils
checkout. This is the Python replacement for tools/makegmaps.php.

Usage:
    python -m batmap_build.build --maputils extern/maputils --out build

Output layout (under --out):
    tiles/{zoom}/{y}/{x}.png          -- color terrain tiles, zoom 1..MAX_ZOOM
    tiles-ascii/{zoom}/{y}/{x}.png    -- text/ASCII tiles, zoom in ASCII_ZOOM_LEVELS
    data/markers.json
    data/tradelane.json
    data/trlines.json
    data/world.json
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

from . import ascii_render
from . import markers as markers_mod
from . import render, tiles
from .mapfile import read_map
from .world import MAP_CONTINENTS, WORLD_OX, WORLD_OY, WORLD_W, WORLD_H
from .zoomconfig import ASCII_ZOOM_LEVELS, LABEL_MIN_ZOOM, MAX_ZOOM, MIN_ZOOM, zoom_to_pyramid_index

FONT_RELATIVE_PATH = Path("world") / "MonospaceBold.ttf"


def _newest_mtime(paths: list[Path]) -> float:
    return max((p.stat().st_mtime for p in paths if p.exists()), default=0.0)


def build(maputils_dir: Path, out_dir: Path, force: bool = False, with_ascii: bool = True) -> None:
    world_dir = maputils_dir / "world"
    tiles_dir = out_dir / "tiles"
    ascii_tiles_dir = out_dir / "tiles-ascii"
    data_dir = out_dir / "data"
    font_path = maputils_dir / FONT_RELATIVE_PATH

    if with_ascii and not font_path.exists():
        print(f"warning: font not found at {font_path}, disabling ASCII text layer", file=sys.stderr)
        with_ascii = False

    # Watch the whole package, not just world.py -- otherwise a rendering
    # change (palette/legend tweaks, tile-compositing fixes, etc.) with no
    # corresponding .map/.loc change wouldn't be noticed, and a stale
    # build/ directory would silently keep serving output from before the
    # code change.
    source_files = list(Path(__file__).parent.glob("*.py"))
    for continent in MAP_CONTINENTS:
        source_files.append(world_dir / f"{continent.id}.map")
        source_files.append(world_dir / f"{continent.id}.loc")

    stamp_file = out_dir / ".build_stamp"
    newest_source = _newest_mtime(source_files)
    if not force and stamp_file.exists() and stamp_file.stat().st_mtime >= newest_source:
        print("Nothing changed since last build, skipping (use --force to rebuild anyway).")
        return

    # A full rebuild always starts from a clean tiles/ and tiles-ascii/ --
    # otherwise a config change like narrowing ASCII_ZOOM_LEVELS or MAX_ZOOM
    # would leave the *old* range's tiles sitting on disk forever (the
    # per-continent builder only ever writes tiles, it doesn't know which
    # ones a previous run wrote that this run no longer wants).
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    if ascii_tiles_dir.exists():
        shutil.rmtree(ascii_tiles_dir)

    data_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir.mkdir(parents=True, exist_ok=True)

    # --- Rasterize each continent, one at a time, writing its tiles for
    # every zoom level before moving on to the next continent. Scale levels
    # are generated on demand rather than all up front: at the deepest zoom
    # the largest continent's image is tens of megapixels, and there's no
    # reason to hold every zoom level of every continent in memory at once
    # when the tile builder only ever needs one at a time.
    for continent in MAP_CONTINENTS:
        map_path = world_dir / f"{continent.id}.map"
        if not map_path.exists():
            print(f"warning: missing {map_path}, skipping continent {continent.id}", file=sys.stderr)
            continue

        print(f"Rendering {continent.name} ({continent.id})...")
        mapfile = read_map(map_path)
        base = render.render_base_image(mapfile)

        n_tiles = 0
        for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
            scaled = render.render_scale(base, zoom_to_pyramid_index(zoom))
            n_tiles += tiles.build_tiles_for_continent(continent, scaled, zoom, tiles_dir)
            del scaled

        n_ascii_tiles = 0
        if with_ascii:
            ascii_tiles_dir.mkdir(parents=True, exist_ok=True)
            for zoom in ASCII_ZOOM_LEVELS:
                ascii_image = ascii_render.render_ascii_image(mapfile, zoom, font_path)
                sea_tile = ascii_render.sea_glyph_tile(zoom, font_path)
                n_ascii_tiles += tiles.build_tiles_for_continent(
                    continent, ascii_image, zoom, ascii_tiles_dir, background=sea_tile,
                )
                del ascii_image

        print(f"  {n_tiles} terrain tiles" + (f", {n_ascii_tiles} text tiles" if with_ascii else ""))

    # --- Location markers + tradelanes ---
    print("Parsing location data...")
    marker_records = markers_mod.build_markers_json(maputils_dir)
    tradelane_records = markers_mod.build_tradelane_json()
    trline_records = markers_mod.build_trlines_json()

    (data_dir / "markers.json").write_text(json.dumps(marker_records), encoding="utf-8")
    (data_dir / "tradelane.json").write_text(json.dumps(tradelane_records), encoding="utf-8")
    (data_dir / "trlines.json").write_text(json.dumps(trline_records), encoding="utf-8")
    print(f"Wrote {len(marker_records)} markers, {len(tradelane_records)} tradelane waypoints, "
          f"{len(trline_records)} tradelane lines.")

    # --- World layout + zoom config, for the frontend ---
    world_json = {
        "ox": WORLD_OX, "oy": WORLD_OY, "w": WORLD_W, "h": WORLD_H,
        "minZoom": MIN_ZOOM, "maxZoom": MAX_ZOOM,
        "labelMinZoom": LABEL_MIN_ZOOM,
        "asciiZoomLevels": ASCII_ZOOM_LEVELS if with_ascii else [],
        "continents": [
            {
                "id": c.id, "name": c.name,
                "x0": c.xoffs + WORLD_OX, "y0": c.yoffs + WORLD_OY,
                "x1": c.xoffs + WORLD_OX + c.width - 1,
                "y1": c.yoffs + WORLD_OY + c.height - 1,
                "width": c.width, "height": c.height,
            }
            for c in MAP_CONTINENTS
        ],
    }
    (data_dir / "world.json").write_text(json.dumps(world_json), encoding="utf-8")

    # Record the newest source mtime we built from (not "now") so the
    # comparison in the next run is exact regardless of how long this
    # build itself took.
    stamp_file.touch()
    os.utime(stamp_file, (newest_source, newest_source))
    print("Done.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--maputils", type=Path, required=True, help="Path to the extern/maputils checkout.")
    parser.add_argument("--out", type=Path, required=True, help="Output directory for tiles/ and data/.")
    parser.add_argument("--force", action="store_true", help="Rebuild even if nothing looks changed.")
    parser.add_argument("--no-ascii", action="store_true", help="Skip building the ASCII/text tile layer.")
    args = parser.parse_args(argv)

    build(args.maputils, args.out, force=args.force, with_ascii=not args.no_ascii)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
