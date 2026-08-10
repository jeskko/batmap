"""
Composites a continent's pre-scaled image into the `{zoom}/{y}/{x}.png`
tile quadtree that the frontend serves as a Leaflet tile layer.

Port of the tile-building loop and createTile() in the old
tools/makegmaps.php, but iterating per-continent over just the tile range
that continent's (scaled) bounding box overlaps, rather than scanning every
tile position in the whole world grid and testing every continent against
it. The latter is what the old PHP code did, and it's fine at the old max
zoom, but at the deepest zoom level (32x) the world grid is 2048x2048 tiles
-- scanning all of it 6 times over (once per continent) does ~25 million
no-op overlap checks for a result set of a few tens of thousands of tiles.
Since continents are spatially disjoint in world space, bounding each
continent's own scan range makes this proportional to actual tile count
instead.

Tiles with no continent overlap (pure open ocean) are skipped entirely --
the frontend just paints the map background color there instead of serving
a "sea" tile image. If two continents' bounding boxes ever did overlap the
same tile (they don't today, but nothing enforces it), an existing tile
file is loaded and the new content painted on top rather than clobbered.
"""

import math
from pathlib import Path

from PIL import Image

from .legend import BACKGROUND_SEA_COLOR
from .world import WORLD_OX, WORLD_OY, Continent
from .zoomconfig import TILE_DIM, zoom_to_scale


def build_tiles_for_continent(
    continent: Continent,
    cont_image: Image.Image,
    zoom: int,
    out_dir: Path,
) -> int:
    """Composite one continent's pre-scaled image for one zoom level into
    the tile files it overlaps. Returns the number of tiles written."""
    scale = zoom_to_scale(zoom)
    cont_w, cont_h = cont_image.size

    cx = (continent.xoffs + WORLD_OX) * scale
    cy = (continent.yoffs + WORLD_OY) * scale

    tile_x0 = math.floor(cx / TILE_DIM)
    tile_y0 = math.floor(cy / TILE_DIM)
    tile_x1 = math.ceil((cx + cont_w) / TILE_DIM)
    tile_y1 = math.ceil((cy + cont_h) / TILE_DIM)

    written = 0
    for ty in range(tile_y0, tile_y1):
        zoom_dir = out_dir / str(zoom) / str(ty)
        for tx in range(tile_x0, tile_x1):
            region, dst_pos = _crop_region(cont_image, cx, cy, tx, ty)
            if region is None:
                continue

            zoom_dir.mkdir(parents=True, exist_ok=True)
            tile_path = zoom_dir / f"{tx}.png"
            _paste_onto_tile(tile_path, region, dst_pos)
            written += 1

    return written


def _crop_region(cont_image: Image.Image, cx: float, cy: float, tx: int, ty: int):
    """Figure out what portion of cont_image (if any) falls within tile
    (tx, ty), and where in the 256x256 tile it belongs."""
    cont_w, cont_h = cont_image.size
    tile_x0, tile_y0 = tx * TILE_DIM, ty * TILE_DIM

    src_x, src_y = tile_x0 - cx, tile_y0 - cy
    dst_x, dst_y = 0.0, 0.0
    copy_w, copy_h = float(TILE_DIM), float(TILE_DIM)

    if src_x < 0:
        dst_x, copy_w, src_x = -src_x, copy_w + src_x, 0.0
    if src_y < 0:
        dst_y, copy_h, src_y = -src_y, copy_h + src_y, 0.0

    src_x, src_y = round(src_x), round(src_y)
    copy_w = max(0, min(round(copy_w), cont_w - src_x))
    copy_h = max(0, min(round(copy_h), cont_h - src_y))
    dst_x, dst_y = round(dst_x), round(dst_y)

    if copy_w <= 0 or copy_h <= 0:
        return None, None

    region = cont_image.crop((src_x, src_y, src_x + copy_w, src_y + copy_h))
    return region, (dst_x, dst_y)


def _paste_onto_tile(tile_path: Path, region: Image.Image, dst_pos: tuple[int, int]) -> None:
    if tile_path.exists():
        tile = Image.open(tile_path).convert("RGB")
    else:
        tile = Image.new("RGB", (TILE_DIM, TILE_DIM), BACKGROUND_SEA_COLOR)

    tile.paste(region, dst_pos)
    tile.save(tile_path)
