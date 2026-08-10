/*
 * Location markers, tradelanes, filters, labels and the sidebar location list.
 *
 * Marker "type" is derived client-side from the LOCF_* flags bitmask,
 * exactly like the old site's markers.js (pmapLocGetLocationType) -- the
 * JSON data only carries the raw flags, matching mkloc's actual GMaps JSON
 * output (see utils/batmap_build/markers.py). Tradelane waypoints (loaded
 * separately, from data/tradelane.json) are folded into the same `entries`
 * list with a synthetic type: "tradelane" so they get a type filter chip,
 * clustering and search/list treatment for free instead of being a special
 * case -- only the connecting route *lines* (data/trlines.json) remain a
 * separate always-toggled layer, since a line isn't a "marker type".
 */

import { worldCellCenter, toLeafletZoom } from "./coords.js";

const LOCF_M_MASK = 0x0000f;
const LOCF_M_PCITY = 0x00004;
const LOCF_M_CITY = 0x00008;
const LOCF_T_MASK = 0x0fff0;
const LOCF_T_SHRINE = 0x00010;
const LOCF_T_GUILD = 0x00020;
const LOCF_T_SS = 0x00040;
const LOCF_T_MONSTER = 0x00080;
const LOCF_T_TRAINER = 0x00100;
const LOCF_T_FORT = 0x00200;

const TYPE_META = {
  city:      { label: "Cities",        color: "#e04b4b" },
  pcity:     { label: "Player Cities", color: "#9b59d0" },
  guild:     { label: "Guilds",        color: "#e07b39" },
  shrine:    { label: "Shrines",       color: "#3fb37f" },
  ss:        { label: "Societies",     color: "#4a90d9" },
  trainer:   { label: "Trainers",      color: "#d9a441" },
  monster:   { label: "Monsters",      color: "#7f1d1d" },
  fort:      { label: "Forts",         color: "#6b7280" },
  ferry:     { label: "Ferries",       color: "#9b59d0" },
  tradelane: { label: "Trade Lane Waypoints", color: "#9ca3af" },
  default:   { label: "Areas",         color: "#eab308" },
};

const CONTINENT_COLORS = {
  laenor: "#a55555", rothikgen: "#559955", lucentium: "#555599",
  desolathya: "#559999", furnachia: "#995599", renardy: "#cc7700",
};

function locationType(flags, name) {
  if (name.startsWith("FERRY")) return "ferry";
  const m = flags & LOCF_M_MASK;
  if (m === LOCF_M_CITY) return "city";
  if (m === LOCF_M_PCITY) return "pcity";
  switch (flags & LOCF_T_MASK) {
    case LOCF_T_SHRINE: return "shrine";
    case LOCF_T_GUILD: return "guild";
    case LOCF_T_SS: return "ss";
    case LOCF_T_MONSTER: return "monster";
    case LOCF_T_TRAINER: return "trainer";
    case LOCF_T_FORT: return "fort";
    default: return "default";
  }
}

function typeIcon(type) {
  if (type === "tradelane") {
    return L.divIcon({
      className: "loc-marker",
      html: `<span class="loc-dot loc-dot--tradelane"></span>`,
      iconSize: [8, 8],
      iconAnchor: [4, 4],
    });
  }
  const meta = TYPE_META[type] || TYPE_META.default;
  return L.divIcon({
    className: "loc-marker",
    html: `<span class="loc-dot" style="background:${meta.color}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

/** Generic "chip filter" widget shared by the continent and type filter rows. */
function createFilterGroup(container, { title, items, onChange }) {
  const state = {};
  for (const item of items) state[item.id] = true;

  const wrap = document.createElement("div");
  wrap.className = "filter-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  wrap.appendChild(heading);

  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  wrap.appendChild(chipRow);

  const chips = {};

  function isAllVisible() {
    return items.every((item) => state[item.id]);
  }

  function refreshChips() {
    const allVisible = isAllVisible();
    chips.all.classList.toggle("active", allVisible);
    for (const item of items) {
      chips[item.id].classList.toggle("active", state[item.id]);
    }
  }

  function setAll(value) {
    for (const item of items) state[item.id] = value;
  }

  function handleClick(id) {
    // "All" toggles every category on/off together; every other chip only
    // ever affects itself.
    if (id === "all") setAll(!isAllVisible());
    else state[id] = !state[id];
    refreshChips();
    onChange(state);
  }

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = "chip chip--all";
  allChip.textContent = "All";
  allChip.addEventListener("click", () => handleClick("all"));
  chipRow.appendChild(allChip);
  chips.all = allChip;

  for (const item of items) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    if (item.color) chip.style.setProperty("--chip-color", item.color);
    chip.textContent = item.label;
    chip.addEventListener("click", () => handleClick(item.id));
    chipRow.appendChild(chip);
    chips[item.id] = chip;
  }

  refreshChips();
  container.appendChild(wrap);
  return state;
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function initMarkers(map, worldInfo, ui) {
  const [markerRecords, tradelanePoints, trlines] = await Promise.all([
    loadJson("data/markers.json"),
    loadJson("data/tradelane.json"),
    loadJson("data/trlines.json"),
  ]);

  const locationEntries = markerRecords.map((rec) => ({
    ...rec,
    type: locationType(rec.flags, rec.name),
    continentId: (rec.continent || "").toLowerCase(),
  }));

  // Tradelane waypoints join the same entries list (see module docstring)
  // instead of being a separate special-cased marker group.
  const tradelaneEntries = tradelanePoints.map((wp) => ({
    x: wp.x, y: wp.y, name: wp.name, html: wp.html, flags: 0,
    type: "tradelane", continentId: "",
  }));

  const entries = locationEntries.concat(tradelaneEntries);

  const usedTypes = [...new Set(entries.map((e) => e.type))]
    .sort()
    .map((id) => ({ id, label: TYPE_META[id]?.label || id, color: (TYPE_META[id] || TYPE_META.default).color }));

  const continentItems = worldInfo.continents.map((c) => ({
    id: c.id, label: c.name, color: CONTINENT_COLORS[c.id] || "#888",
  }));

  const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 1 });
  const routeLinesGroup = L.layerGroup();
  const markerEntries = new Map(); // Leaflet marker -> entry, for the layeradd handler below

  // Only the closest few zoom levels offer name labels -- below that, too
  // many markers are on screen at once for permanent text to stay
  // readable. worldInfo.labelMinZoom (tile-zoom numbering) is the single
  // source of truth, set alongside ASCII_ZOOM_LEVELS in zoomconfig.py.
  const labelMinZoom = toLeafletZoom(worldInfo.labelMinZoom);
  let labelsEnabled = false;

  for (const entry of entries) {
    entry.marker = L.marker(worldCellCenter(entry.x, entry.y), { icon: typeIcon(entry.type) })
      .bindPopup(entry.html)
      .bindTooltip(entry.name, { permanent: true, direction: "right", offset: [8, 0], className: "loc-label" });
    // Leaflet auto-opens a "permanent" tooltip the instant its marker is
    // actually attached to the map -- and MarkerClusterGroup defers that
    // attachment internally, so there's no reliable single point in our
    // own setup code to close it "just after" that happens. Instead,
    // intercept every tooltipopen event (whatever triggered it -- Leaflet's
    // auto-show on attach, or our own openTooltip() calls below) and shut
    // it again immediately, synchronously, whenever it shouldn't currently
    // be showing. This reacts to the actual symptom rather than guessing
    // at internal event ordering.
    entry.marker.on("tooltipopen", () => {
      if (!wantsLabel(entry)) entry.marker.closeTooltip();
    });
    markerEntries.set(entry.marker, entry);
    clusterGroup.addLayer(entry.marker);
  }
  clusterGroup.addTo(map);

  for (const line of trlines) {
    L.polyline(line.map((pt) => worldCellCenter(pt.x, pt.y)), {
      color: "#ffffff", weight: 2, opacity: 0.55,
    }).addTo(routeLinesGroup);
  }
  // The checkbox starts checked in index.html, but nothing fires its
  // "change" event just because it happens to render checked -- match the
  // layer's initial state to the control's initial state explicitly.
  if (ui.routeLinesToggle.checked) routeLinesGroup.addTo(map);

  let typeState = {};
  let continentState = {};
  let searchQuery = "";

  function isVisible(entry) {
    if (!typeState[entry.type]) return false;
    if (entry.continentId && continentState[entry.continentId] === false) return false;
    if (searchQuery && !entry.name.toLowerCase().includes(searchQuery)) return false;
    return true;
  }

  // Clicking a cluster normally zooms in to spread its members apart at
  // their real positions (rather than spiderfying them, which only kicks
  // in for markers so close together that no amount of zooming would ever
  // separate them) -- but at the zoom that lands on, they're still well
  // below labelMinZoom, so without help they show up as a handful of
  // unlabeled, hard-to-tell-apart circles. clusterclick fires for every
  // cluster click before Leaflet decides whether to zoom or spiderfy, and
  // getAllChildMarkers() recurses through any nested sub-clusters too, so
  // this covers the reveal either way.
  //
  // These forced labels should go away again once the user moves on --
  // but "moves on" specifically means *after* whatever pan/zoom the click
  // itself triggers (that one is expected and shouldn't immediately undo
  // what we just revealed), not the very next view change unconditionally.
  // ignoreNextMoveend + forcedLabelZoom track that: the first moveend after
  // a cluster click is assumed to be that click's own zoomToBoundsOnClick
  // settling, so it just records the zoom it landed on; only a *further*
  // moveend that ends up at a different zoom than that clears the set.
  const forcedLabelMarkers = new Set();
  let forcedLabelZoom = null;
  let ignoreNextMoveend = false;

  clusterGroup.on("clusterclick", (ev) => {
    forcedLabelMarkers.clear();
    for (const m of ev.layer.getAllChildMarkers()) forcedLabelMarkers.add(m);
    ignoreNextMoveend = true;
    updateLabels();
  });

  map.on("moveend", () => {
    if (!forcedLabelMarkers.size) return;
    if (ignoreNextMoveend) {
      ignoreNextMoveend = false;
      forcedLabelZoom = map.getZoom();
    } else if (map.getZoom() !== forcedLabelZoom) {
      forcedLabelMarkers.clear();
    }
    updateLabels();
  });

  // Belt-and-braces for the actual spiderfy case (currently only reachable
  // via zoomToShowLayer()'s programmatic reveal from the sidebar list,
  // since it calls spiderfy directly without going through clusterclick).
  const spiderfiedMarkers = new Set();
  clusterGroup.on("spiderfied", (ev) => {
    spiderfiedMarkers.clear();
    for (const m of ev.markers) spiderfiedMarkers.add(m);
    updateLabels();
  });
  clusterGroup.on("unspiderfied", () => {
    spiderfiedMarkers.clear();
    updateLabels();
  });

  function wantsLabel(entry) {
    if (spiderfiedMarkers.has(entry.marker) || forcedLabelMarkers.has(entry.marker)) return true;
    return labelsEnabled && map.getZoom() >= labelMinZoom && isVisible(entry);
  }

  function reconcileLabel(entry) {
    if (wantsLabel(entry)) entry.marker.openTooltip();
    else entry.marker.closeTooltip();
  }

  function updateLabels() {
    entries.forEach(reconcileLabel);
  }

  // Leaflet auto-shows a marker's "permanent" tooltip the moment the
  // marker is actually attached to the map -- but MarkerClusterGroup
  // manages that attachment internally (deferred past its own clustering
  // pass, not synchronously on addLayer()/addTo()), so a plain
  // updateLabels() call right after setup runs too early to catch markers
  // that get attached later. Reconciling on the cluster group's own
  // 'layeradd' event (whenever it actually attaches an individual marker,
  // whether at startup, after a filter change, or after zooming past
  // disableClusteringAtZoom) catches every case reliably.
  clusterGroup.on("layeradd", (ev) => {
    const entry = markerEntries.get(ev.layer);
    if (entry) reconcileLabel(entry);
  });

  function applyFilters() {
    for (const entry of entries) {
      const visible = isVisible(entry);
      if (visible && !clusterGroup.hasLayer(entry.marker)) clusterGroup.addLayer(entry.marker);
      if (!visible && clusterGroup.hasLayer(entry.marker)) clusterGroup.removeLayer(entry.marker);
      if (entry.listItem) entry.listItem.classList.toggle("is-hidden", !visible);
    }
    for (const group of ui.locationList.querySelectorAll(".location-group")) {
      const anyVisible = group.querySelector(".loc-item:not(.is-hidden)");
      group.classList.toggle("is-hidden", !anyVisible);
    }
    updateLabels();
  }

  typeState = createFilterGroup(ui.typeFilters, {
    title: "Location type", items: usedTypes,
    onChange: (state) => { typeState = state; applyFilters(); },
  });

  continentState = createFilterGroup(ui.continentFilters, {
    title: "Continent", items: continentItems,
    onChange: (state) => { continentState = state; applyFilters(); },
  });

  ui.routeLinesToggle.addEventListener("change", () => {
    if (ui.routeLinesToggle.checked) routeLinesGroup.addTo(map);
    else map.removeLayer(routeLinesGroup);
  });

  ui.labelToggle.addEventListener("change", () => {
    labelsEnabled = ui.labelToggle.checked;
    updateLabels();
  });
  map.on("zoomend", updateLabels);

  ui.search.addEventListener("input", () => {
    searchQuery = ui.search.value.trim().toLowerCase();
    applyFilters();
  });

  buildLocationList(ui.locationList, entries, continentItems, map, clusterGroup);
  applyFilters();

  return { entries, map };
}

function buildLocationList(container, entries, continentItems, map, clusterGroup) {
  container.innerHTML = "";
  const byContinent = new Map(continentItems.map((c) => [c.id, []]));

  for (const entry of entries) {
    // Tradelane waypoints (no continent) aren't listed -- their names are
    // internal routing IDs, not places a visitor would search for by name.
    byContinent.get(entry.continentId)?.push(entry);
  }

  for (const continent of continentItems) {
    const items = byContinent.get(continent.id) || [];
    if (!items.length) continue;
    items.sort((a, b) => a.name.localeCompare(b.name));

    const group = document.createElement("div");
    group.className = "location-group";

    const heading = document.createElement("h4");
    heading.innerHTML = `<span class="dot" style="background:${continent.color}"></span>${continent.label}`;
    group.appendChild(heading);

    for (const entry of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "loc-item";
      btn.textContent = entry.name;
      btn.addEventListener("click", () => {
        // zoomToShowLayer handles un-clustering/spiderfying as needed, then
        // opens the popup once the marker is actually visible on the map.
        clusterGroup.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
      });
      entry.listItem = btn;
      group.appendChild(btn);
    }

    container.appendChild(group);
  }
}
