"""
Renders the "text map" layer: the same continent grids as render.py, but
drawn as their literal ASCII characters (colored by terrain, on a black
background) rather than solid color blocks -- a revival of the original
tools/makegmaps.php's `imagettftext()` glyph rendering, offered as a
toggleable overlay at the zoom levels where a character is actually
legible (see zoomconfig.ASCII_ZOOM_LEVELS).

Rather than calling a font-drawing routine per map cell (with ~1.7M cells
across all continents and up to 3 zoom levels each, that's millions of
individual draw calls), each distinct terrain character's glyph is
rendered to a small bitmap once per (scale, font size), cached, and then
the whole continent image is assembled with a single vectorized numpy
"blockify" operation -- the same LUT-application trick render.py uses for
the color map, just with a small tile image instead of a single color per
palette entry.
"""

from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .mapfile import MapFile
from .render import PALETTE, INDEX_BY_CHAR, char_index_grid
from .zoomconfig import zoom_to_scale

# Font sizes per zoom level, matching the values already present (some
# unused until now) in the old tools/makegmaps.php $fontSize table.
FONT_SIZES = {9: 7, 10: 13, 11: 26}

_CHAR_BY_INDEX = {v: k for k, v in INDEX_BY_CHAR.items()}


@lru_cache(maxsize=None)
def _glyph_tiles(scale: int, font_size: int, font_path: str) -> np.ndarray:
    """One (scale, scale, 3) RGB tile per palette slot: the character drawn
    in its terrain color on a black background. Unrecognized chars (the
    fallback palette slot) render as a blank black tile."""
    font = ImageFont.truetype(font_path, font_size)
    num_slots = PALETTE.shape[0]
    tiles = np.zeros((num_slots, scale, scale, 3), dtype=np.uint8)

    for idx in range(num_slots):
        ch = _CHAR_BY_INDEX.get(idx)
        if ch is None or ch.isspace():
            continue

        color = tuple(int(c) for c in PALETTE[idx])
        img = Image.new("RGB", (scale, scale), (0, 0, 0))
        draw = ImageDraw.Draw(img)
        left, top, right, bottom = draw.textbbox((0, 0), ch, font=font)
        pos = ((scale - (right - left)) / 2 - left, (scale - (bottom - top)) / 2 - top)
        draw.text(pos, ch, font=font, fill=color)
        tiles[idx] = np.asarray(img)

    return tiles


def render_ascii_image(mapfile: MapFile, zoom: int, font_path: Path) -> Image.Image:
    """Render one continent's ASCII/text-map image for one supported zoom level."""
    scale = round(zoom_to_scale(zoom))
    font_size = FONT_SIZES[zoom]
    tiles = _glyph_tiles(scale, font_size, str(font_path))

    index_grid = char_index_grid(mapfile)  # (h, w)
    h, w = index_grid.shape

    blocks = tiles[index_grid]  # (h, w, scale, scale, 3)
    image_array = blocks.transpose(0, 2, 1, 3, 4).reshape(h * scale, w * scale, 3)
    return Image.fromarray(image_array, mode="RGB")
