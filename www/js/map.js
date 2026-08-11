import { worldToLatLng, latLngToWorld, toLeafletZoom, NATIVE_ZOOM_OFFSET } from "./coords.js";

const DEFAULT_ZOOM = -1;

/**
 * Builds the map plus its two base tile layers (terrain, always on; ASCII
 * text map, toggleable and only valid for worldInfo.asciiZoomLevels).
 * Returns { map, asciiLayer } -- the caller wires the ASCII toggle control
 * up to asciiLayer via setupAsciiLayerToggle().
 */
export function createMap(container, worldInfo) {
  const minZoom = toLeafletZoom(worldInfo.minZoom);
  const maxZoom = toLeafletZoom(worldInfo.maxZoom);

  const map = L.map(container, {
    crs: L.CRS.Simple,
    minZoom,
    maxZoom,
    zoomSnap: 1,
    zoomControl: false,
    attributionControl: false,
    // Leaflet's default (60) treats a single typical mouse-wheel notch
    // (~100-120px of accumulated delta on most mice/browsers) as worth
    // 1.5-2 zoom levels, which -- combined with zoomSnap rounding to the
    // nearest whole level -- means every other level gets skipped rather
    // than landing on each one in turn. Raising this so one notch maps
    // to roughly one level fixes it.
    wheelPxPerZoomLevel: 120,
  });

  // GridLayer's own minZoom/maxZoom default to 0/18 and are checked
  // against the *map's* zoom independently of the map's own
  // minZoom/maxZoom -- since our map zoom range is negative (native
  // resolution is zoom 0), these must be set explicitly on every tile
  // layer or it silently refuses to render any tiles at all.
  L.tileLayer("tiles/{z}/{y}/{x}.png", {
    tileSize: 256,
    zoomOffset: NATIVE_ZOOM_OFFSET,
    minZoom,
    maxZoom,
    noWrap: true,
    className: "batmap-tile-layer",
  }).addTo(map);

  let asciiLayer = null;
  if (worldInfo.asciiZoomLevels && worldInfo.asciiZoomLevels.length) {
    asciiLayer = L.tileLayer("tiles-ascii/{z}/{y}/{x}.png", {
      tileSize: 256,
      zoomOffset: NATIVE_ZOOM_OFFSET,
      minZoom: toLeafletZoom(Math.min(...worldInfo.asciiZoomLevels)),
      maxZoom: toLeafletZoom(Math.max(...worldInfo.asciiZoomLevels)),
      noWrap: true,
      className: "batmap-tile-layer batmap-ascii-layer",
    });
    // Not added to the map yet -- it's opt-in via the "Text map" toggle.
    // Its own minZoom/maxZoom mean it automatically shows nothing (falling
    // back to the terrain layer beneath) outside its supported zoom range.
  }

  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Keep panning within (a bit beyond) the actual world extent, rather
  // than letting the view drift off into undefined empty space forever.
  const pad = Math.max(worldInfo.w, worldInfo.h) * 0.15;
  const bounds = L.latLngBounds(
    worldToLatLng(-pad, worldInfo.h + pad),
    worldToLatLng(worldInfo.w + pad, -pad),
  );
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 0.6;

  return { map, asciiLayer };
}

/**
 * Wires a checkbox to show/hide the ASCII text-map overlay layer, and
 * keeps the empty-tile background (open ocean outside any continent) in
 * sync with it: showing the matching per-zoom "~" tile pattern only while
 * the ASCII layer is both toggled on AND actually within its supported
 * zoom range (asciiZoomLevels, tile-zoom numbering) -- outside that range
 * the layer itself already falls back to plain terrain tiles (see
 * createMap()), so the background needs to fall back the same way instead
 * of staying in "ascii" mode at a size that doesn't match anything.
 */
export function setupAsciiLayerToggle(map, asciiLayer, checkbox, asciiZoomLevels) {
  if (!asciiLayer) {
    checkbox.disabled = true;
    checkbox.closest("label")?.classList.add("is-disabled");
    return;
  }

  const container = map.getContainer();

  function updateBackground() {
    const tileZoom = map.getZoom() + NATIVE_ZOOM_OFFSET;
    const active = checkbox.checked && asciiZoomLevels.includes(tileZoom);
    container.classList.toggle("ascii-mode", active);
    container.style.backgroundImage = active ? `url("img/ascii-sea-tile-${tileZoom}.png")` : "";
  }

  checkbox.addEventListener("change", () => {
    if (checkbox.checked) asciiLayer.addTo(map);
    else map.removeLayer(asciiLayer);
    updateBackground();
  });
  map.on("zoomend", updateBackground);
  updateBackground();
}

/** Fit the view to show every continent, used when no deep-link position is given. */
export function fitToContinents(map, worldInfo) {
  if (!worldInfo.continents.length) {
    map.setView(worldToLatLng(worldInfo.w / 2, worldInfo.h / 2), DEFAULT_ZOOM);
    return;
  }

  const bounds = L.latLngBounds(
    worldInfo.continents.map((c) => worldToLatLng(c.x0, c.y0)).concat(
      worldInfo.continents.map((c) => worldToLatLng(c.x1, c.y1)),
    ),
  );
  map.fitBounds(bounds, { padding: [24, 24] });
}

/** Figure out which continent (if any) a world coordinate falls inside. */
export function continentAt(worldInfo, x, y) {
  return worldInfo.continents.find((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) || null;
}

export function setupCursorReadout(map, worldInfo, el) {
  map.on("mousemove", (ev) => {
    const { x, y } = latLngToWorld(ev.latlng);
    const cont = continentAt(worldInfo, x, y);
    let text = `X: ${x}, Y: ${y} — ${cont ? cont.name : "Deep Sea"}`;
    if (cont) {
      text += ` (local ${x - cont.x0 + 1}, ${y - cont.y0 + 1})`;
    }
    el.textContent = text;
  });
  map.on("mouseout", () => {
    el.textContent = "";
  });
}

/**
 * @param toggles map of URL param name -> checkbox element, e.g.
 *   { routes: routeLinesToggle, labels: labelToggle, ascii: asciiToggle }
 *   Each toggle's current checked state is encoded into the generated link.
 * @param extraParams optional () => ({ paramName: stringValue, ... }),
 *   called at click-time, for state that doesn't fit the single-checkbox
 *   shape above (e.g. the set of collapsed sidebar sections).
 */
export function setupMakeLink(map, button, toast, toggles, extraParams) {
  button.addEventListener("click", async () => {
    const { x, y } = latLngToWorld(map.getCenter());
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("x", x);
    url.searchParams.set("y", y);
    url.searchParams.set("zoom", map.getZoom());
    for (const [param, checkbox] of Object.entries(toggles)) {
      url.searchParams.set(param, checkbox.checked ? "1" : "0");
    }
    for (const [param, value] of Object.entries(extraParams ? extraParams() : {})) {
      url.searchParams.set(param, value);
    }

    const link = url.toString();
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied to clipboard!");
    } catch {
      window.prompt("Copy this link:", link);
    }
  });
}

function boolParam(params, name) {
  return params.has(name) ? params.get(name) === "1" : null;
}

export function getDeepLinkParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    x: params.has("x") ? Number(params.get("x")) : null,
    y: params.has("y") ? Number(params.get("y")) : null,
    zoom: params.has("zoom") ? Number(params.get("zoom")) : null,
    name: params.get("name"),
    token: params.get("token"),
    // null means "not specified in the URL, leave the control at its
    // page-default state" -- as opposed to an explicit true/false.
    routes: boolParam(params, "routes"),
    labels: boolParam(params, "labels"),
    ascii: boolParam(params, "ascii"),
    // Comma-separated sidebar section ids that were collapsed when the
    // link was made (see collapsible.js) -- "" (not present) means "none
    // specified, leave every section at its page-default expanded state".
    collapsed: params.has("collapsed")
      ? params.get("collapsed").split(",").filter(Boolean)
      : [],
  };
}

/**
 * Applies a persisted on/off toggle state from a deep link to a checkbox,
 * via a real "change" event rather than just setting .checked -- setting
 * the property directly doesn't fire the event the checkbox's own
 * change-listener relies on to actually apply the effect (this is the
 * same class of bug as a checkbox rendering "checked" in HTML without its
 * effect being applied on page load: the listener only runs on a real
 * user interaction unless we dispatch one ourselves).
 */
export function applyLinkedToggle(checkbox, value) {
  if (value === null || checkbox.checked === value) return;
  checkbox.checked = value;
  checkbox.dispatchEvent(new Event("change"));
}
