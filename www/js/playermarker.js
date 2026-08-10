/*
 * Player portrait marker, from a deep link like
 * ?name=Someone&token=...&x=1234&y=5678
 *
 * Note on scope: the old site (old/gmap2/map.js) stored the `token` value
 * and called a `pmapScheduleNextUpdate()` function to poll for the
 * player's live position -- but that function was never actually defined
 * anywhere in the shipped code, so "live tracking" never worked. What did
 * work, and what this reproduces, is a one-shot marker: place the
 * character's portrait at the given (x, y) and zoom in. `token` is kept
 * as an accepted (currently unused) URL parameter for forward
 * compatibility, matching the old behavior.
 */

import { worldCellCenter } from "./coords.js";

const PLAYER_ZOOM = 2;

export function addPlayerMarker(map, { name, x, y, zoom }) {
  if (!name || x === null || y === null) return null;

  const icon = L.icon({
    iconUrl: `https://www.bat.org/pic/i?s=${encodeURIComponent(name)}&l=0`,
    iconSize: [32, 32],
    className: "player-marker-icon",
  });

  const position = worldCellCenter(x, y);
  const marker = L.marker(position, { icon, zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(`<b>${escapeHtml(name)}</b>`);

  map.setView(position, zoom !== null ? zoom : PLAYER_ZOOM);
  marker.openPopup();

  return marker;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
