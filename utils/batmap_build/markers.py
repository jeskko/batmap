"""
Builds markers.json / tradelane.json / trlines.json from parsed .loc data
and the tradelane config in world.py.

This is a Python port of mkloc's `outputGMapsJSON()`/`outputGMapsHTML()`
(src/mkloc.c) for markers, and of makegmaps.php's tradelane-export section
for tradelane.json/trlines.json. The output schemas match exactly what the
old gmap2 frontend (markers.js) consumed, so the new frontend can reuse the
same field names.
"""

import html
import re
from pathlib import Path

from . import locfile
from .locfile import LOCF_INVIS, LOCF_M_MASK, LOCF_T_MASK, LOCF_CLOSED, AUTHOR_ORIG, \
    AUTHOR_RECODER, AUTHOR_MAINTAINER, AUTHOR_EXPANDER, NAME_ORIG, LocMarker
from .world import MAP_CONTINENTS, TRADELANE_POINTS, TRADELANE_DEFS, get_continent, to_global

_TYPE_PREFIXES = {
    locfile.LOCF_M_PCITY: "PCITY",
}
_TYPE_PREFIXES_T = {
    locfile.LOCF_T_SHRINE: "SHRINE",
    locfile.LOCF_T_GUILD: "GUILD",
    locfile.LOCF_T_SS: "SS",
    locfile.LOCF_T_MONSTER: "MOB",
    locfile.LOCF_T_TRAINER: "TRAINER",
    locfile.LOCF_T_FORT: "FORT",
    # 'c' (major city) moved from the M-group to here in LOC format v5.1 --
    # see locfile.py's module docstring for why.
    locfile.LOCF_T_CITY: "CITY",
}

_AUTHOR_ROLE_SUFFIX = {
    AUTHOR_ORIG: " (O)",
    AUTHOR_RECODER: " (R)",
    AUTHOR_MAINTAINER: " (M)",
    AUTHOR_EXPANDER: " (E)",
}
_AUTHOR_ROLE_TITLE = {
    AUTHOR_ORIG: "Original coder",
    AUTHOR_RECODER: "Re-coder",
    AUTHOR_MAINTAINER: "Maintainer",
    AUTHOR_EXPANDER: "Expander",
}

# Matches "AQ "Some Quest"" or "LQ42 "Some Quest"" style references inside
# freeform text (port of getQuestDataString + getQuestLink in mkloc.c).
_QUEST_RE = re.compile(r'(?:AQ|LQ\d+)[^"\n]*"([^"]*)"')


def _quest_linkify(text: str) -> str:
    def repl(m: re.Match) -> str:
        name = m.group(1)
        slug = "+".join(name.lower().split())
        return f'<a target="_blank" href="https://www.bat.org/help/quests?str={slug}">{m.group(0)}</a>'
    return _QUEST_RE.sub(repl, text)


def location_type_prefix(flags: int) -> str | None:
    """Port of locGetTypePrefix()."""
    mtype = _TYPE_PREFIXES.get(flags & LOCF_M_MASK)
    if mtype is not None:
        return mtype
    return _TYPE_PREFIXES_T.get(flags & LOCF_T_MASK)


def _print_type(marker: LocMarker, label: bool) -> str:
    """Port of locPrintType(): primary name, optionally with type prefix
    and a "(CLOSED)" suffix."""
    out = []
    if label:
        prefix = location_type_prefix(marker.flags)
        if prefix is not None:
            out.append(prefix + " ")

    name = marker.names[0].name if marker.names else "UNKNOWN"
    out.append(name)

    if label and (marker.flags & LOCF_CLOSED):
        out.append(" (CLOSED)")

    return "".join(out)


def build_html(marker: LocMarker) -> str:
    """Port of outputGMapsHTML()."""
    parts = []

    label = _print_type(marker, label=True)
    if marker.uri:
        parts.append(f'<b><a target="_blank" href="{marker.uri}">{label}</a></b><br>')
    else:
        parts.append(f"<b>{label}</b><br>")

    if len(marker.names) > 1:
        alt = []
        for n in marker.names[1:]:
            s = n.name
            if n.flags & NAME_ORIG:
                s += " (*)"
            alt.append(s)
        parts.append("Also known as <i>" + " ; ".join(alt) + "</i>.<br>")

    if marker.added.valid:
        parts.append(f"Added {marker.added.day:02d}.{marker.added.month:02d}.{marker.added.year:04d}.<br>")

    if marker.authors:
        if marker.flags & locfile.LOCF_M_PCITY:
            parts.append("Societies: " + ", ".join(a.name for a in marker.authors))
        else:
            links = []
            for a in marker.authors:
                suffix = _AUTHOR_ROLE_SUFFIX.get(a.flags, "")
                title = _AUTHOR_ROLE_TITLE.get(a.flags, "")
                links.append(
                    f'<a target="_blank" href="https://tnsp.org/maps/loc.php?a={a.name}" '
                    f'title="{title}">{a.name}{suffix}</a>'
                )
            parts.append("Authors: " + ", ".join(links))
        parts.append(".<br>")

    if marker.freeform:
        parts.append("<br>" + _quest_linkify(marker.freeform) + "<br>")

    return "".join(parts)


def build_markers_json(maputils_dir: Path) -> list[dict]:
    """Parse every continent's .loc file and emit the markers.json record list."""
    out = []
    for continent in MAP_CONTINENTS:
        loc_path = maputils_dir / "world" / f"{continent.id}.loc"
        if not loc_path.exists():
            continue

        for marker in locfile.parse_loc_file(loc_path):
            if marker.flags & LOCF_INVIS:
                continue

            gx, gy = to_global(continent, marker.xc, marker.yc)
            out.append({
                "x": gx,
                "y": gy,
                "labeldir": marker.align,
                "name": _print_type(marker, label=False),
                "html": build_html(marker),
                "flags": marker.flags,
                "continent": continent.name,
            })

    return out


def _waypoint_global(name: str) -> tuple[int, int]:
    cid, lx, ly = TRADELANE_POINTS[name]
    return to_global(get_continent(cid), lx, ly)


def build_tradelane_json() -> list[dict]:
    """Port of makegmaps.php's tradelane waypoint export."""
    out = []
    for name in TRADELANE_POINTS:
        x, y = _waypoint_global(name)
        out.append({
            "x": x,
            "y": y,
            "name": name,
            "html": f"<b>TRADELANE WPT</b><br>{html.escape(name)}",
            "continent": "",
            "type": "tradelane",
            "flags": 0,
        })
    return out


def build_trlines_json() -> list[list[dict]]:
    """Port of makegmaps.php's tradelane polyline export."""
    lines = []
    for waypoints in TRADELANE_DEFS:
        line = []
        for wp in waypoints:
            x, y = _waypoint_global(wp)
            line.append({"x": x, "y": y})
        lines.append(line)
    return lines
