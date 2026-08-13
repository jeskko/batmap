"""
Single source of truth for the zoom <-> scale <-> pyramid-index relationship
shared by render.py, ascii_render.py, tiles.py and build.py.

    scale = 2 ** (zoom - 6)      -- native 1px/cell resolution sits at zoom 6
    pyramid index = zoom - 1     -- indices 0..(MAX_ZOOM-1) for zoom 1..MAX_ZOOM

TILE_DIM/MIN_ZOOM/MAX_ZOOM together define the tile pyramid actually built.
Bumping MAX_ZOOM is the only change needed to add another (deeper) zoom
level -- everything else derives from it.
"""

TILE_DIM = 256
MIN_ZOOM = 1
MAX_ZOOM = 11  # was 10; the extra level exists mainly to give the ASCII
               # text layer (see ascii_render.py) enough pixels/cell to be
               # legible -- see NATIVE_SCALE_INDEX below for the math.

NATIVE_SCALE_INDEX = 5  # pyramid index of 1px/cell (zoom 6)
NUM_SCALES = MAX_ZOOM   # indices 0..(MAX_ZOOM-1)

# Zoom levels that also get an ASCII/text tile pyramid (see ascii_render.py).
# Matches LABEL_MIN_ZOOM below -- the top two levels (14px/28px per
# cell). Zoom 9's 6px cells did read more as texture than text, so it was 
# dropped from the ASCII tile set.
ASCII_ZOOM_LEVELS = [10, 11]

# Zoom levels (closest-in) at which permanent marker name labels are offered.
LABEL_MIN_ZOOM = MAX_ZOOM - 2  # top three levels: 9, 10 and 11


def zoom_to_scale(zoom: int) -> float:
    return 2.0 ** (zoom - 6)


def zoom_to_pyramid_index(zoom: int) -> int:
    return zoom - 1
