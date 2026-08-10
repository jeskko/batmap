"""
Rasterizes a continent's ASCII `.map` grid into a colored base image, then
produces individual scale levels of the image pyramid used to build tiles.

This replaces makegmaps.php's two-stage approach (GD pixel/block/glyph
rendering for scales 1x-16x, then a separate ImageMagick `convert -scale`
pass for the <1x overview scales) with a single native-resolution raster
(1 pixel per map cell) that every other scale is resampled from.

Scale levels are generated on demand (one at a time) rather than eagerly
building the whole pyramid up front: at the deepest zoom (32x, see
zoomconfig.MAX_ZOOM) the largest continent's image is on the order of
25000x25000px, and holding that for every zoom level of every continent
simultaneously would use several GB of memory for no benefit -- the tile
builder only ever needs one scale level of one continent at a time (see
build.py's per-continent orchestration).
"""

import numpy as np
from PIL import Image

from .legend import MAP_LEGEND, UNKNOWN_COLOR
from .mapfile import MapFile
from .zoomconfig import NATIVE_SCALE_INDEX


def _build_palette_lut() -> tuple[np.ndarray, dict[str, int]]:
    """A char -> palette-index LUT plus the palette-index -> RGB table, so
    rasterization is one vectorized fancy-index operation instead of a
    per-cell Python loop."""
    chars = sorted(MAP_LEGEND)
    palette = np.zeros((len(chars) + 1, 3), dtype=np.uint8)
    index_by_char = {}
    for i, ch in enumerate(chars):
        palette[i] = MAP_LEGEND[ch].color
        index_by_char[ch] = i
    palette[len(chars)] = UNKNOWN_COLOR  # fallback slot for unrecognized chars
    return palette, index_by_char


PALETTE, INDEX_BY_CHAR = _build_palette_lut()
UNKNOWN_INDEX = len(PALETTE) - 1


def char_index_grid(mapfile: MapFile) -> np.ndarray:
    """Char grid -> palette-index grid (shared with ascii_render.py so both
    renderers agree on the same char set). Rows may be ragged (shorter than
    `width`); pad with the sea/unknown fallback rather than crashing."""
    index_grid = np.full((mapfile.height, mapfile.width), UNKNOWN_INDEX, dtype=np.uint8)
    for y, row in enumerate(mapfile.rows):
        for x, ch in enumerate(row):
            index_grid[y, x] = INDEX_BY_CHAR.get(ch, UNKNOWN_INDEX)
    return index_grid


def render_base_image(mapfile: MapFile) -> Image.Image:
    """Render the continent's native-resolution (1px/cell) RGB image."""
    rgb = PALETTE[char_index_grid(mapfile)]  # vectorized LUT application -> (h, w, 3)
    return Image.fromarray(rgb, mode="RGB")


def render_scale(base: Image.Image, index: int) -> Image.Image:
    """Produce a single scale level (see zoomconfig.py) from the
    native-resolution base image."""
    if index == NATIVE_SCALE_INDEX:
        return base

    scale = 2.0 ** (index - NATIVE_SCALE_INDEX)
    native_w, native_h = base.size
    size = (max(1, round(native_w * scale)), max(1, round(native_h * scale)))
    # Crisp pixel blocks when zooming in, smoother averaging when zooming
    # out to a tiny overview thumbnail.
    resample = Image.NEAREST if scale >= 1 else Image.BOX
    return base.resize(size, resample=resample)
