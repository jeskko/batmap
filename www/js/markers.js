/*
 * Location markers, tradelanes, filters, labels and the sidebar location list.
 *
 * Marker "type" is derived client-side from the LOCF_* flags bitmask, the
 * same way the old site's markers.js (pmapLocGetLocationType) did -- the
 * JSON data only carries the raw flags, matching mkloc's actual GMaps JSON
 * output (see utils/batmap_build/markers.py). One flag has since drifted
 * from that old (frozen, LOC format v5.0-era) reference on purpose: 'c'
 * (major city) moved from a marker-type bit to a location-type one in
 * upstream's v5.1, so locationType() below follows the current
 * liblocfile.h/mkloc.c instead of the old site's stale grouping for that
 * one case -- see LOCF_T_CITY below. Tradelane waypoints (loaded
 * separately, from data/tradelane.json) are folded into the same `entries`
 * list with a synthetic type: "tradelane" so they get a type filter chip,
 * clustering and search/list treatment for free instead of being a special
 * case -- only the connecting route *lines* (data/trlines.json) remain a
 * separate always-toggled layer, since a line isn't a "marker type". The
 * waypoint markers are additionally tied to that same toggle (see
 * isVisible()), so turning the lines off hides the waypoints too rather
 * than leaving them looking like a disconnected, half-off feature.
 */

import { worldCellCenter } from "./coords.js";
import { buildLocationLink, copyLink } from "./map.js";
import { makeCollapsible } from "./collapsible.js";

const LOCF_M_MASK = 0x0000f;
const LOCF_M_PCITY = 0x00004;
const LOCF_T_MASK = 0x0fff0;
const LOCF_T_SHRINE = 0x00010;
const LOCF_T_GUILD = 0x00020;
const LOCF_T_SS = 0x00040;
const LOCF_T_MONSTER = 0x00080;
const LOCF_T_TRAINER = 0x00100;
const LOCF_T_FORT = 0x00200;
// 'c' (major city) moved from the marker-type group to the location-type
// group in LOC format v5.1 -- upstream's own words: "Major city 'c' flag
// is no longer a marker type, but a location type." Before that, a
// location couldn't be both a scenic marker and a major city at once;
// now it can (e.g. Laenor's Dortlewall/Pleasantville, flags "1?c"/"2?c"),
// which is exactly why this needs its own independent bit here rather
// than living in LOCF_M_MASK alongside the mutually-exclusive markers.
const LOCF_T_CITY = 0x00400;

// Label/color/emoji per location type is configured server-side in
// legend.py's LOCATION_TYPE_LEGEND and shipped via world.json's
// "locationTypes" key (set below, once worldInfo is available) -- this is
// just an emergency fallback for a stale/pre-upgrade world.json that
// doesn't carry that key yet.
const FALLBACK_TYPE = { label: "Areas", color: "#eab308", emoji: "📍" };
let TYPE_META = {};

const CONTINENT_COLORS = {
  laenor: "#a55555", rothikgen: "#559955", lucentium: "#555599",
  desolathya: "#559999", furnachia: "#995599", renardy: "#cc7700",
};

function locationType(flags, name) {
  if (name.startsWith("FERRY")) return "ferry";
  const m = flags & LOCF_M_MASK;
  if (m === LOCF_M_PCITY) return "pcity";
  switch (flags & LOCF_T_MASK) {
    case LOCF_T_SHRINE: return "shrine";
    case LOCF_T_GUILD: return "guild";
    case LOCF_T_SS: return "ss";
    case LOCF_T_MONSTER: return "monster";
    case LOCF_T_TRAINER: return "trainer";
    case LOCF_T_FORT: return "fort";
    case LOCF_T_CITY: return "city";
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
  const meta = TYPE_META[type] || TYPE_META.default || FALLBACK_TYPE;
  return L.divIcon({
    className: "loc-marker",
    html: `<span class="loc-dot" style="background:${meta.color}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

/** Generic "chip filter" widget shared by the continent and type filter rows. */
function createFilterGroup(container, { title, items, onChange, sectionId, collapseState }) {
  const state = {};
  for (const item of items) state[item.id] = true;

  const wrap = document.createElement("div");
  wrap.className = "filter-group";
  wrap.dataset.sectionId = sectionId;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "section-header";
  header.innerHTML = `<span class="chevron" aria-hidden="true"></span><h3>${title}</h3>`;
  wrap.appendChild(header);

  const body = document.createElement("div");
  body.className = "section-body";
  wrap.appendChild(body);

  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  body.appendChild(chipRow);

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
  makeCollapsible(header, wrap, sectionId, collapseState);
  return state;
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Appended to every popup's own HTML -- a small permalink icon that copies
// a link straight to this location (see the popupopen handler below, which
// wires its href/click each time a given marker's popup opens). Loading
// that link lands here again with the same popup automatically re-opened,
// via app.js's deep-link handling + openAt() below.
const PERMALINK_HTML =
  '<div class="popup-permalink"><a href="#" class="popup-permalink-link" ' +
  'title="Copy link to this location" aria-label="Copy link to this location">🔗</a></div>';

export async function initMarkers(map, worldInfo, ui, collapseState, toast) {
  TYPE_META = worldInfo.locationTypes || {};

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
    .map((id) => {
      const meta = TYPE_META[id] || TYPE_META.default || FALLBACK_TYPE;
      return { id, label: `${meta.emoji} ${meta.label || id}`, color: meta.color };
    });

  const continentItems = worldInfo.continents.map((c) => ({
    id: c.id, label: c.name, color: CONTINENT_COLORS[c.id] || "#888",
  }));

  const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 1 });
  const routeLinesGroup = L.layerGroup();
  const markerEntries = new Map(); // Leaflet marker -> entry, for the layeradd handler below

  // The checkbox starts checked in index.html (matching the old site,
  // which always showed marker labels) -- match that initial state
  // explicitly, same reasoning as ui.routeLinesToggle below: rendering
  // "checked" in HTML doesn't itself fire the "change" listener that
  // actually applies the effect.
  let labelsEnabled = ui.labelToggle.checked;

  for (const entry of entries) {
    entry.marker = L.marker(worldCellCenter(entry.x, entry.y), { icon: typeIcon(entry.type) })
      .bindPopup(entry.html + PERMALINK_HTML)
      .bindTooltip(entry.name, {
        permanent: true, direction: "right", offset: [8, 0], className: "loc-label", interactive: true,
      });
    // (Re)set the permalink icon's target every time this popup opens --
    // it depends on the current zoom, which can change between opens.
    // Same reused-DOM-element situation as the tooltip above (the popup's
    // element persists across opens/closes too), but assigning .onclick
    // (a single slot) rather than addEventListener needs no extra
    // bound-once guard to avoid piling up duplicate listeners.
    entry.marker.on("popupopen", () => {
      const link = entry.marker.getPopup()?.getElement()?.querySelector(".popup-permalink-link");
      if (!link) return;
      link.href = buildLocationLink(entry.x, entry.y, map.getZoom());
      link.onclick = (ev) => {
        ev.preventDefault();
        copyLink(link.href, toast);
      };
    });
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
      if (!wantsLabel(entry)) {
        entry.marker.closeTooltip();
        return;
      }
      // Make the label itself clickable, doing exactly what clicking the
      // marker's own dot does. The tooltip's DOM element is reused across
      // opens/closes (only its visibility toggles), but tooltipopen fires
      // every time it's shown -- guard with a data attribute so the
      // listener is attached at most once per element.
      const el = entry.marker.getTooltip()?.getElement();
      if (el && !el.dataset.locLabelClickBound) {
        el.dataset.locLabelClickBound = "1";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          entry.marker.openPopup();
        });
      }
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
    // Tradelane waypoints are tied to the "Trade lane routes" toggle too,
    // not just their own type filter chip -- turning the routes (the
    // connecting lines) off but leaving the waypoint dots/labels on-screen
    // would read as "trade lanes" only being half turned off.
    if (entry.type === "tradelane" && !ui.routeLinesToggle.checked) return false;
    return true;
  }

  // Clicking a cluster normally zooms in to spread its members apart at
  // their real positions (rather than spiderfying them, which only kicks
  // in for markers so close together that no amount of zooming would ever
  // separate them) -- but if the "Marker labels" toggle happens to be off,
  // they'd land there as a handful of unlabeled, hard-to-tell-apart circles
  // with no way to tell them apart short of clicking each one. clusterclick
  // fires for every cluster click before Leaflet decides whether to zoom or
  // spiderfy, and getAllChildMarkers() recurses through any nested
  // sub-clusters too, so this covers the reveal either way.
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

  // Whether entry's marker is currently rendered as its own individual pin
  // rather than absorbed into a cluster bubble (or not on the map at all).
  // getVisibleParent() walks a marker's cluster-tree ancestry up to the
  // first node that actually has an on-screen icon -- that's the marker
  // itself if it's shown standalone, a cluster if it's currently grouped,
  // or null if nothing in its ancestry is visible (e.g. filtered out).
  function isIndividuallyShown(entry) {
    return clusterGroup.getVisibleParent(entry.marker) === entry.marker;
  }

  function wantsLabel(entry) {
    if (spiderfiedMarkers.has(entry.marker) || forcedLabelMarkers.has(entry.marker)) return true;
    if (!isVisible(entry)) return false;
    // Tradelane waypoint labels are always shown once the waypoint itself
    // is individually visible, independent of the "Marker labels" toggle --
    // this is how the old site's tradelane markers behaved too: every
    // marker there always carried a permanent label.
    if (entry.type === "tradelane") return isIndividuallyShown(entry);
    // Every other type's label just follows its own marker -- once it's
    // shown as its own pin (not merged into a cluster) and the "Marker
    // labels" toggle is on, show its label too. There's no separate zoom
    // threshold beyond that -- clustering itself is what keeps a crowded
    // "far away" zoom from being swamped with permanent text, the same way
    // it already keeps it from being swamped with individual dots.
    return labelsEnabled && isIndividuallyShown(entry);
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

  // Reassigned once buildLocationList() sets up the continent bar stack
  // below -- applyFilters() can run before that (it doesn't, today, but
  // this keeps the two decoupled) and a hidden continent must never be
  // left occupying a slot in the pinned stack or the sticky hand-off.
  let recomputeContinentStack = () => {};

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
    recomputeContinentStack();
  }

  typeState = createFilterGroup(ui.typeFilters, {
    title: "Location type", items: usedTypes,
    onChange: (state) => { typeState = state; applyFilters(); },
    sectionId: "filter:type", collapseState,
  });

  continentState = createFilterGroup(ui.continentFilters, {
    title: "Continent", items: continentItems,
    onChange: (state) => { continentState = state; applyFilters(); },
    sectionId: "filter:continent", collapseState,
  });

  ui.routeLinesToggle.addEventListener("change", () => {
    if (ui.routeLinesToggle.checked) routeLinesGroup.addTo(map);
    else map.removeLayer(routeLinesGroup);
    // Tradelane waypoint markers/labels are tied to this same toggle (see
    // isVisible() above) -- re-run the filter pass so they show/hide with
    // the lines instead of only on the next unrelated filter change.
    applyFilters();
  });

  ui.labelToggle.addEventListener("change", () => {
    labelsEnabled = ui.labelToggle.checked;
    updateLabels();
  });
  // Zooming changes clustering (markers merge into/out of cluster bubbles)
  // without necessarily changing which entries pass isVisible() -- labels
  // need reconciling either way, since wantsLabel() depends on whether a
  // marker is currently shown individually (see isIndividuallyShown()).
  map.on("zoomend", updateLabels);

  ui.search.addEventListener("input", () => {
    searchQuery = ui.search.value.trim().toLowerCase();
    applyFilters();
  });

  recomputeContinentStack = buildLocationList(ui.locationList, entries, continentItems, map, clusterGroup, collapseState);
  applyFilters();

  // Opens the popup of whichever entry sits at exact world coords (x, y),
  // if any -- used for deep links whose x/y happen to match a location
  // marker (see app.js), same as the old site's pmapGetMarkerIndexByCoords
  // + pmapMyClick did on load. zoomToShowLayer un-clusters/spiderfies as
  // needed first; if the marker's already visible (the common case, since
  // a link is normally made while its popup is open) it just opens the
  // popup without moving the view.
  function openAt(x, y) {
    const entry = entries.find((e) => e.x === x && e.y === y);
    if (!entry) return false;
    clusterGroup.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
    return true;
  }

  return { entries, map, openAt };
}

/**
 * Sets up the persistent "pile of continent bars" effect: as a continent's
 * whole group (bar + items) scrolls past, its bar is moved out of the flow
 * and appended to `stack` -- a `position: sticky; top: 0` strip pinned
 * above the list -- so it stays visible and clickable no matter how far
 * you scroll, instead of disappearing once you've moved on to later
 * continents. The upcoming (not-yet-passed) continent's own bar remains
 * `position: sticky` inside its own group, docked at `top: <stack height>`
 * so it appears directly below the pinned stack.
 *
 * "Passed" is recomputed from scratch on every scroll frame rather than
 * tracked incrementally -- with at most a handful of continents this is
 * cheap, and it trivially self-corrects when scrolling back up (a bar
 * un-pins and returns to its own group) or when filtering hides a
 * continent entirely (skipped, left in its own group, uncounted).
 */
function createContinentStackRecomputer(scrollEl, stack, continentGroups) {
  let ticking = false;

  function recompute() {
    ticking = false;
    if (!scrollEl) return;
    const containerTop = scrollEl.getBoundingClientRect().top;
    let cumulative = 0;
    let stillPassed = true;

    for (const { group, heading } of continentGroups) {
      if (group.classList.contains("is-hidden")) {
        if (heading.parentElement !== group) group.insertBefore(heading, group.firstChild);
        heading.style.position = "sticky";
        heading.style.top = "0px";
        continue;
      }

      const isPassed = stillPassed && group.getBoundingClientRect().bottom <= containerTop + cumulative;
      if (!isPassed) stillPassed = false;

      if (isPassed) {
        if (heading.parentElement !== stack) stack.appendChild(heading);
        heading.style.position = "static";
        heading.style.top = "";
        cumulative += heading.offsetHeight;
      } else {
        if (heading.parentElement !== group) group.insertBefore(heading, group.firstChild);
        heading.style.position = "sticky";
        heading.style.top = `${cumulative}px`;
      }
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(recompute);
  }

  scrollEl?.addEventListener("scroll", onScroll);
  window.addEventListener("resize", recompute);
  recompute();
  return recompute;
}

/**
 * Scrolls so `group`'s content starts right below wherever the pinned
 * stack will end once every continent before it is pinned -- i.e. "the
 * start of this continent's locations," regardless of whether `group`'s
 * own bar is currently pinned in the stack, sticky-docked live, or just
 * sitting further down the list not yet reached. Using `group`'s own rect
 * (not its bar's) matters: once a bar is pinned, it's reparented out of
 * `group` and no longer reflects the group's actual document position.
 */
function scrollContinentToTop(group, scrollEl, stackHeightBefore) {
  if (!scrollEl) return;
  const groupRect = group.getBoundingClientRect();
  const scrollRect = scrollEl.getBoundingClientRect();
  const delta = (groupRect.top - scrollRect.top) - stackHeightBefore;
  scrollEl.scrollTo({ top: scrollEl.scrollTop + delta, behavior: "smooth" });
}

function buildLocationList(container, entries, continentItems, map, clusterGroup, collapseState) {
  container.innerHTML = "";
  const byContinent = new Map(continentItems.map((c) => [c.id, []]));

  for (const entry of entries) {
    // Tradelane waypoints (no continent) aren't listed -- their names are
    // internal routing IDs, not places a visitor would search for by name.
    byContinent.get(entry.continentId)?.push(entry);
  }

  // Pinned above every continent group, in document order -- see
  // createContinentStackRecomputer(). Empty (zero height) until the first
  // continent scrolls past.
  const stack = document.createElement("div");
  stack.className = "continent-stack";
  container.appendChild(stack);

  const scrollEl = container.closest(".sidebar-scroll");
  const continentGroups = [];
  const recompute = createContinentStackRecomputer(scrollEl, stack, continentGroups);

  continentItems.forEach((continent) => {
    const items = byContinent.get(continent.id) || [];
    if (!items.length) return;
    items.sort((a, b) => a.name.localeCompare(b.name));

    const sectionId = `loc:${continent.id}`;
    const group = document.createElement("div");
    group.className = "location-group";
    group.dataset.sectionId = sectionId;

    const heading = document.createElement("div");
    heading.className = "location-group-heading";
    heading.style.background = continent.color;

    const chevron = document.createElement("button");
    chevron.type = "button";
    chevron.className = "chevron-toggle";
    chevron.setAttribute("aria-label", `Collapse ${continent.label}`);
    chevron.innerHTML = `<span class="chevron" aria-hidden="true"></span>`;
    // The chevron only ever toggles collapse -- it doesn't also jump-scroll
    // (that's the title's job below), so collapsing continents you don't
    // care about doesn't fight with the list jumping around underneath you.
    chevron.addEventListener("click", (ev) => ev.stopPropagation());
    heading.appendChild(chevron);

    const title = document.createElement("button");
    title.type = "button";
    title.className = "loc-group-title";
    title.textContent = continent.label;
    heading.appendChild(title);

    group.appendChild(heading);

    const body = document.createElement("div");
    body.className = "location-group-body";
    group.appendChild(body);

    for (const entry of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "loc-item";
      const meta = TYPE_META[entry.type] || TYPE_META.default || FALLBACK_TYPE;
      btn.textContent = `${meta.emoji} ${entry.name}`;
      btn.addEventListener("click", () => {
        // zoomToShowLayer handles un-clustering/spiderfying as needed, then
        // opens the popup once the marker is actually visible on the map.
        clusterGroup.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
      });
      entry.listItem = btn;
      body.appendChild(btn);
    }

    makeCollapsible(chevron, group, sectionId, collapseState);
    // Collapsing changes this group's height, which can shift whether it
    // (or a later one) now counts as "passed" -- keep the stack in sync
    // immediately rather than waiting for the next scroll event.
    chevron.addEventListener("click", () => recompute());

    // Clicking the bar itself always expands (if needed) and jump-scrolls
    // to the start of this continent's locations -- whether the bar is
    // currently pinned in the stack, docked live, or further down the list.
    title.addEventListener("click", () => {
      if (group.classList.contains("is-collapsed")) {
        group.classList.remove("is-collapsed");
        chevron.setAttribute("aria-expanded", "true");
        collapseState.set(sectionId, false);
      }
      const stackHeightBefore = continentGroups
        .slice(0, continentGroups.findIndex((g) => g.group === group))
        .reduce((sum, g) => sum + (g.group.classList.contains("is-hidden") ? 0 : g.heading.offsetHeight), 0);
      scrollContinentToTop(group, scrollEl, stackHeightBefore);
      recompute();
    });

    continentGroups.push({ group, heading });
    container.appendChild(group);
  });

  recompute();
  return recompute;
}
