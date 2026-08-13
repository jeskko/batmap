"""
Terrain legend: map character -> (name, RGB color).

Ported from the `mapPieces[]` table in extern/maputils/src/libmaputils.c,
which is the canonical/richer legend (it also carries human-readable terrain
names, useful for a UI legend/tooltip) -- as opposed to the smaller ad-hoc
palette that was duplicated directly inside the old tools/makegmaps.php.

Where libmaputils.c lists more than one entry for the same character (e.g.
old-format aliases guarded by #ifdef SECRET_MAP_DATA_FORMAT, or fallback
entries keyed by `mapchar` rather than a literal character), only the
entries that apply to the plain, non-secret .map format are kept here.

Two exceptions, deliberately NOT matching libmaputils.c: '~' (Sea) and 'l'
(Lake) instead use the colors from tools/makegmaps.php's own $mapPalette,
because that's what the actual old live site rendered and what people
remember -- libmaputils.c's values for these two happen to invert which of
the two reads as the darker/lighter blue, which showed up as a visibly
"swapped" look once compared side by side with the original.
"""

from typing import NamedTuple


class TerrainInfo(NamedTuple):
    name: str
    color: tuple[int, int, int]


# char -> TerrainInfo
MAP_LEGEND: dict[str, TerrainInfo] = {
    "!": TerrainInfo("Mountain Peak",    (0xcc, 0xff, 0xff)),
    "#": TerrainInfo("Ruins",            (0x88, 0x88, 0x88)),
    "%": TerrainInfo("Special Location", (0xff, 0xff, 0xff)),
    "+": TerrainInfo("Crossing",         (0x33, 0x33, 0x33)),
    "-": TerrainInfo("Road",             (0x33, 0x33, 0x33)),
    "|": TerrainInfo("Road",             (0x33, 0x33, 0x33)),
    "/": TerrainInfo("Road",             (0x33, 0x33, 0x33)),
    "\\": TerrainInfo("Road",            (0x33, 0x33, 0x33)),
    ".": TerrainInfo("Plains",           (0x55, 0x92, 0x00)),
    "=": TerrainInfo("Bridge",           (0x33, 0x33, 0x33)),
    "?": TerrainInfo("Scenic Location",  (0xff, 0xff, 0xff)),
    "@": TerrainInfo("Flowing Lava",     (0xff, 0x99, 0x3f)),
    "C": TerrainInfo("Player City",      (0x88, 0x88, 0x88)),
    "F": TerrainInfo("Deep Forest",      (0x00, 0x88, 0x00)),
    "H": TerrainInfo("Highlands",        (0x66, 0x3f, 0x00)),
    "L": TerrainInfo("Lava Lake",        (0xff, 0x50, 0x00)),
    "R": TerrainInfo("Deep River",       (0x33, 0x66, 0xff)),
    "V": TerrainInfo("Volcano",          (0xff, 0x33, 0x00)),
    "^": TerrainInfo("Mountain",         (0x71, 0x82, 0x92)),
    "b": TerrainInfo("Beach",            (0xcf, 0xc4, 0xa5)),
    "c": TerrainInfo("City",             (0x88, 0x88, 0x88)),
    "d": TerrainInfo("Desert",           (0xee, 0xaa, 0x22)),
    "f": TerrainInfo("Forest",           (0x00, 0xb6, 0x00)),
    "h": TerrainInfo("Hills",            (0x99, 0x66, 0x00)),
    "i": TerrainInfo("Ice",              (0xee, 0xee, 0xff)),
    "j": TerrainInfo("Jungle",           (0x13, 0x96, 0x36)),
    "l": TerrainInfo("Lake",             (0x64, 0x64, 0xff)),
    "r": TerrainInfo("River",            (0x66, 0x99, 0xff)),
    "s": TerrainInfo("Swamp",            (0x9d, 0xa8, 0x0a)),
    "t": TerrainInfo("Tundra",           (0x61, 0xc3, 0xa2)),
    "v": TerrainInfo("Valley",           (0x22, 0xdd, 0x22)),
    "w": TerrainInfo("Waterfall",        (0x77, 0xaa, 0xff)),
    "x": TerrainInfo("Badlands",         (0x8a, 0x83, 0x60)),
    "y": TerrainInfo("Fields",           (0xa7, 0xcc, 0x14)),
    "z": TerrainInfo("Shore",            (0xa7, 0xcc, 0x14)),
    ",": TerrainInfo("Muddy Trail",      (0x8c, 0x57, 0x38)),
    "&": TerrainInfo("Monster",          (0xff, 0x00, 0x00)),
    "S": TerrainInfo("Shallows",         (0x44, 0xcc, 0xcc)),
    "~": TerrainInfo("Sea",              (0x33, 0x33, 0xaa)),
}

# Color for characters that appear in a .map file but aren't in MAP_LEGEND
# (shouldn't normally happen with well-formed data; fall back to black so
# gaps are visually obvious rather than silently wrong).
UNKNOWN_COLOR: tuple[int, int, int] = (0, 0, 0)

# The "open ocean" background fill used between/around continents when
# compositing tiles, and by the frontend as the map container's background
# color. Deliberately the same value as '~' Sea above (which, per the note
# above, is itself makegmaps.php's original navy) rather than a second,
# slightly-off "sea blue" -- using two different blues here reads as a
# visible seam where a continent's own coastline meets the surrounding
# empty tile background.
BACKGROUND_SEA_COLOR: tuple[int, int, int] = MAP_LEGEND["~"].color


def color_for(char: str) -> tuple[int, int, int]:
    info = MAP_LEGEND.get(char)
    return info.color if info else UNKNOWN_COLOR


class LocationTypeInfo(NamedTuple):
    label: str
    color: str  # "#rrggbb", used directly by the frontend (CSS/canvas)
    emoji: str


# Location-marker "type" -> (sidebar filter label, marker/legend color, emoji
# prefix shown in the sidebar list and type-filter chips). The type ids
# themselves are derived client-side from each marker's raw LOCF_* flags
# (see www/js/markers.js's locationType()) -- this table is exposed to the
# frontend as-is via data/world.json's "locationTypes" key (see build.py),
# so tweaking an emoji/color/label here is all that's needed to change how
# it renders, no JS edit required.
#
# There used to also be a per-type zoom-visibility range here (ported from
# the old gmap2 site's MarkerManager addMarkers(mlist, minzoom, maxzoom)
# calls), gating which types' markers/labels appeared at "far away" zooms.
# Removed in favor of a simpler rule: every type's marker can appear at any
# zoom, and clustering (see www/js/markers.js's isIndividuallyShown()) is
# what actually keeps a crowded zoom from being swamped with dots/labels --
# a marker only gets a label once it's shown as its own pin rather than
# merged into a cluster bubble.
#
# Colors are deliberately saturated/high-contrast ("vivid") rather than the
# muted tones a terrain-legend palette would use -- markers sit on top of
# widely varying terrain colors and only get a thin border (see .loc-dot in
# style.css) to separate them from the map, so each type needs to read as a
# distinct hue at a glance rather than blend in. ferry and pcity used to
# share the same color by accident; every entry here is a unique hue.
LOCATION_TYPE_LEGEND: dict[str, LocationTypeInfo] = {
    "city":      LocationTypeInfo("Cities",               "#ef4444", "🏙️"),
    "pcity":     LocationTypeInfo("Player Cities",        "#a855f7", "🏰"),
    "guild":     LocationTypeInfo("Guilds",               "#f97316", "🏛️"),
    "shrine":    LocationTypeInfo("Shrines",              "#22c55e", "⛩️"),
    "ss":        LocationTypeInfo("Societies",            "#3b82f6", "🤝"),
    "trainer":   LocationTypeInfo("Trainers",             "#eab308", "🎓"),
    "monster":   LocationTypeInfo("Monsters",             "#db2777", "👹"),
    "fort":      LocationTypeInfo("Forts",                "#14b8a6", "🛡️"),
    "ferry":     LocationTypeInfo("Ferries",              "#06b6d4", "⛴️"),
    "tradelane": LocationTypeInfo("Trade Lane Waypoints", "#94a3b8", "🧭"),
    "default":   LocationTypeInfo("Areas",                "#84cc16", "📍"),
}
