"""
World/continent layout and tradelane configuration.

This is a hand-ported mirror of extern/maputils/www/world.inc.php. That file
is plain PHP (arrays + a handful of `define()`s) and changes extremely
rarely (the continent set and their offsets/sizes have been stable for well
over a decade), so rather than writing a PHP parser we just keep this as a
maintained Python copy. If upstream ever changes world.inc.php, re-sync this
file by hand.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Continent:
    id: str            # lowercase key, also the .map/.loc file basename
    name: str           # display name (as used in the old CTI_NAME field)
    xoffs: int
    yoffs: int
    width: int
    height: int
    special: bool
    has_map: bool
    reg_cont: bool      # included in the "regular" continent list


# World coordinate system: origin and total extent.
WORLD_OX = 8192
WORLD_OY = 8192
WORLD_W = 16384
WORLD_H = 16384

# Mirrors $continentList in world.inc.php.
CONTINENTS = [
    Continent("laenor",     "Laenor",      1,     1,    827, 781, False, True, True),
    Continent("rothikgen",  "Rothikgen",   1311, -1255, 480, 480, False, True, True),
    Continent("lucentium",  "Lucentium",  -634,   2345, 700, 500, False, True, True),
    Continent("furnachia",  "Furnachia",   1211,  1155, 440, 480, False, True, True),
    Continent("desolathya", "Desolathya", -1210,   820, 540, 530, False, True, True),
    Continent("renardy",    "Renardy",     2070,  -910, 168,  86, True,  True, True),
    Continent("limbo",      "Limbo",          0,     0,   0,   0, True,  False, False),
    Continent("special",    "Special",        0,     0,   0,   0, True,  False, True),
    Continent("hcbat",      "HCBat",          0,     0,   0,   0, True,  True,  False),
]

# Continents actually rendered/rasterized (has a map AND is a "regular" continent).
MAP_CONTINENTS = [c for c in CONTINENTS if c.has_map and c.reg_cont]

_BY_ID = {c.id: c for c in CONTINENTS}


def get_continent(cid: str) -> Continent:
    return _BY_ID[cid]


def to_global(continent: Continent, local_x: int, local_y: int) -> tuple[int, int]:
    """
    Convert a continent-local coordinate (origin 1,1, per the .loc format) to
    the shared world coordinate space.

    This mirrors the formula used in both mkloc (liblocfile.c: marker->xc =
    marker->xc + offX - 1, where offX = worldMap.ox + continent.xoffs) and
    makegmaps.php's stGetWorldCoords() for tradelane waypoints -- both derive
    the same global coordinate.
    """
    gx = local_x + WORLD_OX + continent.xoffs - 1
    gy = local_y + WORLD_OY + continent.yoffs - 1
    return gx, gy


# Tradelane waypoints: name -> (continent_id, local_x, local_y)
# Mirrors $tradelanePoints in world.inc.php.
TRADELANE_POINTS: dict[str, tuple[str, int, int]] = {
    "daerwon":               ("laenor", 300, 360),
    "arelium1":              ("laenor", 311, 360),
    "arelium2":              ("laenor", 364, 413),
    "arelium3":              ("laenor", 364, 466),

    "laenor1":               ("laenor", 250, 310),
    "laenor2":               ("laenor", 250, 70),
    "laenor3":               ("laenor", 310, 10),
    "laenor4":               ("laenor", 780, 10),
    "laenor5":               ("laenor", 780, 644),
    "laenor6":               ("laenor", 664, 760),
    "laenor7":               ("laenor", 205, 760),
    "laenor8":               ("laenor", 145, 700),
    "laenor9":               ("laenor", 145, 515),
    "laenor10":              ("laenor", 734, 10),

    "laenor-furnachia":      ("laenor", 664 + 169, 760),

    "furnachia1":            ("furnachia", 98, 81),
    "furnachia2":            ("furnachia", 188, 81),

    "rothikgen1":            ("rothikgen", 262, 428),
    "rothikgen2":            ("rothikgen", 22, 188),
    "rothikgen3":            ("rothikgen", 22, 90),
    "rothikgen4":            ("rothikgen", 461, 229),
    "rothikgen5":            ("rothikgen", 461, 33),

    "rothikgen6":            ("rothikgen", 136, 302),
    "rothikgen7":            ("rothikgen", 186, 252),
    "rothikgen8":            ("rothikgen", 195, 261),

    "desolathya1":           ("desolathya", 532, 96),
    "desolathya2":           ("desolathya", 532, 475),
    "desolathya3":           ("desolathya", 462, 475),
    "desolathya4":           ("desolathya", 463, 27),
    "desolathya5":           ("desolathya", 218, 27),
    "desolathya6":           ("desolathya", 22, 223),
    "desolathya7":           ("desolathya", 22, 418),
    "desolathya8":           ("desolathya", 114, 510),
    "desolathya9":           ("desolathya", 369, 510),
    "desolathya10":          ("desolathya", 22, 82),
    "desolathya11":          ("desolathya", 433, 446),  # 1 south-east from windhamkeep
    "windhamkeep":           ("desolathya", 432, 445),  # Not the location itself, but 1 e from it.

    "desocrater1":           ("desolathya", 421, 207),
    "desocrater2":           ("desolathya", 278, 207),

    "laenor-desolathya":     ("desolathya", 532 + 84, 96),
    "desolathya-lucentium1": ("desolathya", 532 + 45, 475),
    "desolathya-lucentium2": ("desolathya", 532 + 45, 475 + 667),

    "laenor-lucentium":      ("lucentium", 397, 13 - 1459),

    "lucentium1":            ("lucentium", 397, 13),
    "lucentium2":            ("lucentium", 474, 13),
    "lucentium3":            ("lucentium", 474, 480),
    "lucentium4":            ("lucentium", 397 - 348, 13 + 348),

    "lucentium5":            ("lucentium", 474, 167),
    "lucentium6":            ("lucentium", 421, 167),
    "lucentium7":            ("lucentium", 411, 157),
}

# Tradelanes defined as ordered lists of waypoint names.
# Mirrors $tradelaneDefs in world.inc.php.
TRADELANE_DEFS: list[list[str]] = [
    # Laenor
    ["daerwon", "laenor1", "laenor2", "laenor3", "laenor4", "laenor5", "laenor6", "laenor7", "laenor8", "laenor9"],
    ["daerwon", "arelium1", "arelium2", "arelium3"],
    ["laenor9", "daerwon"],

    # Furnachia
    ["furnachia1", "furnachia2"],

    # Lucentium
    ["desolathya-lucentium1", "desolathya-lucentium2", "lucentium1"],
    ["lucentium1", "lucentium2", "lucentium3"],
    ["lucentium1", "lucentium4"],
    ["lucentium5", "lucentium6", "lucentium7"],

    # Rothikgen
    ["rothikgen1", "rothikgen2", "rothikgen3"],
    ["rothikgen1", "rothikgen4", "rothikgen5"],
    ["rothikgen6", "rothikgen7", "rothikgen8"],

    # Desolathya
    ["desolathya2", "desolathya1", "desolathya4", "desolathya5", "desolathya6", "desolathya7",
     "desolathya8", "desolathya9", "desolathya11"],
    ["desolathya6", "desolathya10"],
    ["desocrater1", "desocrater2"],

    # Between continents
    ["laenor6", "laenor-furnachia", "furnachia1"],
    ["laenor-lucentium", "lucentium1"],
    ["laenor10", "rothikgen1"],
    ["laenor9", "laenor-lucentium", "desolathya-lucentium1", "desolathya2", "desolathya3",
     "desolathya11", "windhamkeep"],
    ["laenor2", "laenor-desolathya", "desolathya1"],
]
