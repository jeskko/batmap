/*
 * World <-> Leaflet LatLng coordinate conversion.
 *
 * The tile/marker/tradelane data all share one flat pixel coordinate space
 * (see utils/batmap_build/world.py: to_global()) where 1 world unit = 1
 * pixel at "native" resolution. That native resolution is tile zoom 6 in
 * the tiles/{zoom}/... folder numbering (see zoomconfig.py on the Python
 * side; the tile pyramid's actual min/max zoom is data-driven, read from
 * data/world.json, rather than hardcoded here).
 *
 * Leaflet's CRS.Simple treats the map as flat, unprojected pixel space too:
 * at its zoom 0, 1 CRS unit = 1 pixel, doubling per zoom level exactly like
 * our tile pyramid. So we just need a constant offset between the two zoom
 * numbering schemes (NATIVE_ZOOM_OFFSET) and a coordinate flip: Leaflet
 * LatLngs use lat increasing "up" while our world Y increases downward
 * (like the ASCII map rows/tile rows it comes from).
 */

export const TILE_SIZE = 256;

// Leaflet zoom 0 == tile zoom 6 (native 1px/world-unit resolution). Must
// match zoomconfig.py's NATIVE_SCALE_INDEX (5) + 1.
export const NATIVE_ZOOM_OFFSET = 6;

/** Tile-numbering zoom (e.g. world.json's minZoom/maxZoom) -> Leaflet zoom. */
export function toLeafletZoom(tileZoom) {
  return tileZoom - NATIVE_ZOOM_OFFSET;
}

export function worldToLatLng(x, y) {
  return L.latLng(-y, x);
}

export function latLngToWorld(latlng) {
  return { x: Math.round(latlng.lng), y: Math.round(-latlng.lat) };
}
