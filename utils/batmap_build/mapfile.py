"""
Reader for maputils' raw ASCII `.map` files: a fixed-width grid of terrain
characters, one row per line, one character per world cell.
"""

from pathlib import Path


class MapFile:
    def __init__(self, rows: list[str], width: int, height: int):
        self.rows = rows
        self.width = width
        self.height = height

    def char_at(self, x: int, y: int) -> str | None:
        """0-based (x, y) lookup. Returns None if out of bounds."""
        if 0 <= y < self.height and 0 <= x < len(self.rows[y]):
            return self.rows[y][x]
        return None


def read_map(path: Path) -> MapFile:
    with open(path, "r", encoding="iso-8859-1", newline="") as f:
        raw_rows = f.read().split("\n")

    # Drop a single trailing empty line from the final newline, but keep
    # interior blank lines (shouldn't normally occur, but don't silently
    # collapse the grid's row count if they do).
    if raw_rows and raw_rows[-1] == "":
        raw_rows.pop()

    rows = [row.rstrip("\r") for row in raw_rows]
    width = max((len(r) for r in rows), default=0)
    height = len(rows)

    return MapFile(rows, width, height)
