"""
Parser for maputils' `.loc` file format (version 5.1), as documented in
extern/maputils/README.loc and implemented in extern/maputils/src/liblocfile.c.

This is a from-scratch character-level parser mirroring liblocfile.c's state
machine closely enough to match its behavior on well-formed files: record
lines starting with a digit, 9 semicolon-separated fields, backslash-escaping
of delimiter characters within string fields, backslash+newline as a
line-continuation marker, pipe-separated location names and comma-separated
author names within their respective fields.

We intentionally do NOT reimplement mkloc's "-o" update-loc / map-diffing
mode (cross-checking marker glyphs embedded in the raw .map grid against
known locations to flag new/moved locations) -- that's an authoring aid used
interactively by maputils maintainers, not part of the JSON-export path that
tools/makegmaps.php actually drives, so LOCF_INVALID/LOCF_NOMARKER/
LOCF_MAPCHAR never get set in that pipeline and we don't need them either.

v5.0 -> v5.1 (README.loc's own changelog): the 'c' (major city) flag moved
from being a marker type (mutually exclusive with scenic/pcity markers) to
a location type (independent of them) -- upstream's own words: "Major city
'c' flag is no longer a marker type, but a location type." That's why
LOCF_T_CITY lives in the T (location-type) group below rather than the M
(marker) group; a location can now legitimately be both a scenic marker and
a major city at once (e.g. Laenor's Dortlewall/Pleasantville, flags "1?c"/
"2?c"), which the old mutually-exclusive M-group grouping couldn't express.
"""

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Marker types (mutually exclusive within this group)
LOCF_M_SCENIC1 = 0x000001   # '?' Scenic
LOCF_M_SCENIC2 = 0x000002   # '%' Shrine scenic
LOCF_M_PCITY   = 0x000004   # 'C' Player city
LOCF_M_MASK    = 0x00000F

# Location types (mutually exclusive within this group)
LOCF_T_SHRINE  = 0x000010   # 'S' Raceshrine
LOCF_T_GUILD   = 0x000020   # 'G' Guild
LOCF_T_SS      = 0x000040   # 'P' Player guild/secret society
LOCF_T_MONSTER = 0x000080   # 'M' Special monster
LOCF_T_TRAINER = 0x000100   # 'T' Guild-related trainer
LOCF_T_FORT    = 0x000200   # 'F' Regional fort
LOCF_T_CITY    = 0x000400   # 'c' Major city (moved here in v5.1, see above)
LOCF_T_MASK    = 0x00FFF0

# Extra flags
LOCF_INVIS     = 0x010000   # '-' Invisible marker / don't show label
LOCF_CLOSED    = 0x020000   # '!' Location is CLOSED
LOCF_INSTANCED = 0x040000   # 'I' Location is "instanced"

_MARKER_FLAG_CHARS = {"?": LOCF_M_SCENIC1, "%": LOCF_M_SCENIC2, "C": LOCF_M_PCITY}
_TYPE_FLAG_CHARS = {"S": LOCF_T_SHRINE, "G": LOCF_T_GUILD, "P": LOCF_T_SS,
                    "M": LOCF_T_MONSTER, "T": LOCF_T_TRAINER, "F": LOCF_T_FORT,
                    "c": LOCF_T_CITY}
_EXTRA_FLAG_CHARS = {"-": LOCF_INVIS, "!": LOCF_CLOSED, "I": LOCF_INSTANCED}

# Mirrors liblocfile.h's own LOC_VERSION_MAJOR/MINOR -- what this parser was
# actually last checked against and updated for.
LOC_VERSION_MAJOR = 5
LOC_VERSION_MINOR = 1
_VERSION_HEADER_RE = re.compile(r"MapUtils LOC file \(version (\d+)\.(\d+)\)")

NAME_ORIG = 0x00001         # '@' prefix on a name subfield

AUTHOR_ORIG = 0x00001       # '@'
AUTHOR_RECODER = 0x00002    # '!'
AUTHOR_MAINTAINER = 0x00004  # '%'
AUTHOR_EXPANDER = 0x00008   # '&'
_AUTHOR_FLAG_CHARS = {"@": AUTHOR_ORIG, "!": AUTHOR_RECODER, "%": AUTHOR_MAINTAINER, "&": AUTHOR_EXPANDER}

TS_ACC_DEFAULT = 0
TS_ACC_KNOWN = "!"
TS_ACC_GUESSTIMATE = "?"
TS_ACC_APPROXIMATE = "#"
_TS_ACC_CHARS = {"!": TS_ACC_KNOWN, "?": TS_ACC_GUESSTIMATE, "#": TS_ACC_APPROXIMATE}


@dataclass
class LocName:
    name: str
    flags: int = 0


@dataclass
class LocDate:
    day: int = 0
    month: int = 0
    year: int = 0
    accuracy: int = TS_ACC_DEFAULT
    valid: bool = False


@dataclass
class LocMarker:
    """A single parsed location record, in continent-local coordinates."""
    xc: int
    yc: int
    align: int
    flags: int
    mapchar: str | None
    names: list[LocName] = field(default_factory=list)
    authors: list[LocName] = field(default_factory=list)
    added: LocDate = field(default_factory=LocDate)
    uri: str | None = None
    freeform: str | None = None


class LocParseError(ValueError):
    pass


def _skip_ws(text: str, i: int, n: int) -> int:
    """Skip spaces/tabs and backslash-newline continuations between fields."""
    while i < n:
        ch = text[i]
        if ch in " \t":
            i += 1
        elif ch == "\\" and i + 1 < n and text[i + 1] in "\r\n":
            i += 1
            if text[i] == "\r":
                i += 1
                if i < n and text[i] == "\n":
                    i += 1
            else:
                i += 1
        else:
            break
    return i


def _read_escaped(text: str, i: int, n: int, stopchars: str) -> tuple[str, int]:
    """
    Read a string field, honoring backslash-escaping of any character and
    backslash+newline as a swallowed line continuation. Stops (without
    consuming) at the first unescaped character in `stopchars`.
    """
    out: list[str] = []
    while i < n:
        ch = text[i]
        if ch in stopchars:
            break
        if ch in "\r\n":
            raise LocParseError(f"Unexpected end of line inside field at offset {i}")
        if ch == "\\":
            i += 1
            if i >= n:
                raise LocParseError("Unexpected end of file inside field")
            nxt = text[i]
            if nxt == "\r":
                i += 1
                if i < n and text[i] == "\n":
                    i += 1
                continue
            if nxt == "\n":
                i += 1
                continue
            out.append(nxt)
            i += 1
            continue
        out.append(ch)
        i += 1
    # Only trailing whitespace is trimmed (matches liblocfile.c's parseFieldString).
    return "".join(out).rstrip(" \t"), i


def _read_int(text: str, i: int, n: int) -> tuple[int, int]:
    start = i
    while i < n and text[i].isdigit():
        i += 1
    if i == start:
        raise LocParseError(f"Expected digit at offset {i}")
    return int(text[start:i]), i


def _read_multi(text: str, i: int, n: int, sep: str) -> tuple[list[str], int]:
    """Read '|'- or ','-separated subfields, terminated by ';'."""
    values: list[str] = []
    stopchars = sep + ";"
    while True:
        i = _skip_ws(text, i, n)
        val, i = _read_escaped(text, i, n, stopchars)
        values.append(val)
        if i >= n:
            raise LocParseError("Unexpected end of file inside multi-value field")
        stop = text[i]
        i += 1
        if stop == ";":
            return values, i
        # else stop == sep, loop for another subfield


def _split_name_prefix(raw: str, prefix_map: dict[str, int]) -> LocName:
    if raw and raw[0] in prefix_map:
        return LocName(raw[1:], prefix_map[raw[0]])
    return LocName(raw, 0)


def _parse_flags_field(text: str, i: int, n: int) -> tuple[int, int, int]:
    """Parse the align digit + flag character field. Returns (align, flags, next_i)."""
    if i >= n or not text[i].isdigit():
        raise LocParseError(f"Expected align digit at offset {i}")
    align = int(text[i])
    i += 1
    flags = 0
    while i < n:
        ch = text[i]
        if ch in _MARKER_FLAG_CHARS:
            flags |= _MARKER_FLAG_CHARS[ch]
        elif ch in _TYPE_FLAG_CHARS:
            flags |= _TYPE_FLAG_CHARS[ch]
        elif ch in _EXTRA_FLAG_CHARS:
            flags |= _EXTRA_FLAG_CHARS[ch]
        else:
            break
        i += 1
    return align, flags, i


def _parse_date(raw: str) -> LocDate:
    if not raw:
        return LocDate(valid=False)
    accuracy = TS_ACC_DEFAULT
    stamp = raw
    if raw[0] in _TS_ACC_CHARS:
        accuracy = _TS_ACC_CHARS[raw[0]]
        stamp = raw[1:]
    parts = stamp.split(".")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        day, month, year = (int(p) for p in parts)
        return LocDate(day, month, year, accuracy, valid=True)
    return LocDate(valid=False)


def _parse_record(text: str, i: int, n: int) -> tuple[LocMarker, int]:
    # Field 1: X coordinate
    xc, i = _read_int(text, i, n)
    i = _skip_ws(text, i, n)
    if i >= n or text[i] != ";":
        raise LocParseError(f"Expected ';' after X coordinate at offset {i}")
    i += 1

    # Field 2: Y coordinate
    i = _skip_ws(text, i, n)
    yc, i = _read_int(text, i, n)
    i = _skip_ws(text, i, n)
    if i >= n or text[i] != ";":
        raise LocParseError(f"Expected ';' after Y coordinate at offset {i}")
    i += 1

    # Field 3: label orientation + flags
    i = _skip_ws(text, i, n)
    align, flags, i = _parse_flags_field(text, i, n)
    i = _skip_ws(text, i, n)
    if i >= n or text[i] != ";":
        raise LocParseError(f"Expected ';' after flags field at offset {i}")
    i += 1

    # Field 4: current map char (optional, single char)
    i = _skip_ws(text, i, n)
    mapchar_str, i = _read_escaped(text, i, n, ";")
    mapchar = mapchar_str[0] if mapchar_str else None
    if i >= n or text[i] != ";":
        raise LocParseError(f"Expected ';' after map char field at offset {i}")
    i += 1

    # Field 5: location name(s), '|'-separated
    i = _skip_ws(text, i, n)
    raw_names, i = _read_multi(text, i, n, "|")
    names = [_split_name_prefix(r, {"@": NAME_ORIG}) for r in raw_names]

    # Field 6: authors, ','-separated. An empty field (no authors given) still
    # comes back from _read_multi as one empty-string subfield rather than
    # zero -- it unconditionally reads one value before checking for the
    # terminator -- so drop blanks here rather than downstream, or "no
    # author" would render as one author literally named "".
    raw_authors, i = _read_multi(text, i, n, ",")
    authors = [_split_name_prefix(r, _AUTHOR_FLAG_CHARS) for r in raw_authors if r.strip()]

    # Field 7: timestamp
    i = _skip_ws(text, i, n)
    date_str, i = _read_escaped(text, i, n, ";")
    added = _parse_date(date_str)
    if i >= n or text[i] != ";":
        raise LocParseError(f"Expected ';' after timestamp field at offset {i}")
    i += 1

    # Field 8: URI
    i = _skip_ws(text, i, n)
    uri, i = _read_escaped(text, i, n, ";")
    if i >= n or text[i] != ";":
        raise LocParseError(f"Expected ';' after URI field at offset {i}")
    i += 1

    # Field 9: freeform, terminated by an actual (unescaped) end of line
    i = _skip_ws(text, i, n)
    freeform, i = _read_escaped(text, i, n, "\r\n")

    marker = LocMarker(
        xc=xc, yc=yc, align=align, flags=flags, mapchar=mapchar,
        names=names, authors=authors, added=added,
        uri=uri or None, freeform=freeform or None,
    )
    return marker, i


def _check_version_header(comment_line: str, path: Path) -> None:
    """
    Mirrors liblocfile.c's own version-header check (which also only ever
    inspects the very first comment line, "because loc file identification
    should be the first comment line"): a major-version mismatch means this
    parser's flag/field assumptions may no longer hold at all, so it's a
    hard error, same as upstream refusing to read the file; a minor-version
    mismatch is only logged, matching upstream's own "does not change the
    format per se" treatment -- but it's still worth a look, since that's
    exactly the kind of bump that introduced the v5.0->v5.1 'c' flag change
    documented above.
    """
    match = _VERSION_HEADER_RE.search(comment_line)
    if not match:
        return  # not every file necessarily leads with the version comment
    major, minor = int(match.group(1)), int(match.group(2))
    if major != LOC_VERSION_MAJOR:
        raise LocParseError(
            f"{path}: LOC file format version {major}.{minor} detected, this parser "
            f"understands {LOC_VERSION_MAJOR}.{LOC_VERSION_MINOR} -- refusing to parse, "
            "it likely needs updating for the new format first."
        )
    if minor != LOC_VERSION_MINOR:
        print(
            f"warning: {path}: LOC file format version {major}.{minor} detected, "
            f"this parser was last updated for {LOC_VERSION_MAJOR}.{LOC_VERSION_MINOR} -- "
            "proceeding, but check README.loc's changelog for anything semantic.",
            file=sys.stderr,
        )


def parse_loc_file(path: Path) -> list[LocMarker]:
    text = path.read_text(encoding="iso-8859-1")
    n = len(text)
    i = 0
    records: list[LocMarker] = []
    version_checked = False

    while i < n:
        ch = text[i]
        if ch in " \t\r\n":
            i += 1
            continue
        if ch == "#":
            line_start = i
            while i < n and text[i] not in "\r\n":
                i += 1
            if not version_checked:
                version_checked = True
                _check_version_header(text[line_start:i], path)
            continue
        if ch.isdigit():
            marker, i = _parse_record(text, i, n)
            records.append(marker)
            continue
        raise LocParseError(f"Syntax error in {path} at offset {i}: unexpected {ch!r}")

    return records
