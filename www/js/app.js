import { createMap, fitToContinents, setupCursorReadout, setupMakeLink, setupAsciiLayerToggle, getDeepLinkParams, applyLinkedToggle } from "./map.js";
import { worldToLatLng } from "./coords.js";
import { initMarkers } from "./markers.js";
import { addPlayerMarker } from "./playermarker.js";
import { createCollapseState, makeCollapsible } from "./collapsible.js";

async function main() {
  const worldInfo = await fetchJson("data/world.json");
  const { map, asciiLayer } = createMap(document.getElementById("map"), worldInfo);

  // Deep-link params (position, toggles, and which sidebar sections were
  // collapsed) are all read up front, before anything they affect gets
  // built, so both the static sections below and initMarkers()'s dynamic
  // ones can consult the same collapse state from the start.
  const deepLink = getDeepLinkParams();
  const collapseState = createCollapseState(deepLink.collapsed);

  for (const section of document.querySelectorAll("[data-section-id]")) {
    const header = section.querySelector(":scope > .section-header");
    if (header) makeCollapsible(header, section, section.dataset.sectionId, collapseState);
  }

  const ui = {
    continentFilters: document.getElementById("continent-filters"),
    typeFilters: document.getElementById("type-filters"),
    routeLinesToggle: document.getElementById("route-lines-toggle"),
    labelToggle: document.getElementById("label-toggle"),
    search: document.getElementById("location-search"),
    locationList: document.getElementById("location-list"),
  };
  const asciiToggle = document.getElementById("ascii-toggle");

  const { openAt } = await initMarkers(map, worldInfo, ui, collapseState, showToast);
  setupAsciiLayerToggle(map, asciiLayer, asciiToggle, worldInfo.asciiZoomLevels || []);

  setupCursorReadout(map, worldInfo, document.getElementById("cursor-readout"));
  setupMakeLink(map, document.getElementById("make-link"), showToast, {
    routes: ui.routeLinesToggle, labels: ui.labelToggle, ascii: asciiToggle,
  }, () => ({ collapsed: collapseState.toArray().join(",") }));
  setupSidebarToggle(map);

  // Apply persisted view + toggle state from a shared link. Toggles are
  // applied after initMarkers()/setupAsciiLayerToggle() above so their
  // change-event listeners already exist to react to it.
  applyLinkedToggle(ui.routeLinesToggle, deepLink.routes);
  applyLinkedToggle(ui.labelToggle, deepLink.labels);
  applyLinkedToggle(asciiToggle, deepLink.ascii);

  if (deepLink.name) {
    addPlayerMarker(map, deepLink);
  } else if (deepLink.x !== null && deepLink.y !== null) {
    map.setView(worldToLatLng(deepLink.x, deepLink.y), deepLink.zoom ?? 0);
    // If the linked coordinates happen to be exactly a location marker's
    // own (x, y), open its info box automatically -- same as the old
    // site's behavior when arriving via a marker's permalink.
    openAt(deepLink.x, deepLink.y);
  } else {
    fitToContinents(map, worldInfo);
  }
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2500);
}

// The hamburger button toggles the sidebar on both mobile (an overlay,
// hidden by default -- "is-open" reveals it) and desktop (a normal flex
// layout item, visible by default -- "is-collapsed" hides it instead,
// reclaiming the map space). Which class applies depends on the viewport
// at click time, matching whichever CSS rule (see style.css's Sidebar and
// Responsive sections) is actually in effect there.
//
// On desktop, collapsing the sidebar also hides the header/footer bars --
// a "pseudo fullscreen" map view (see style.css's body.is-fullscreen rules)
// -- leaving just this button on-screen as the way back out. Mobile
// doesn't get this: its sidebar is already an overlay with nothing of its
// own for the header/footer to make room for by disappearing.
function setupSidebarToggle(map) {
  const button = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const isDesktop = () => !window.matchMedia("(max-width: 860px)").matches;

  // The label needs to match whichever icon CSS is actually showing (see
  // index.html/style.css) -- a fullscreen expand/exit icon on desktop,
  // where "expanded" means the sidebar/chrome, not the map/fullscreen
  // itself; the plain hamburger's "toggle sidebar" wording on mobile.
  function setExpanded(isOpen) {
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute("aria-label", isDesktop()
      ? (isOpen ? "Enter fullscreen map view" : "Exit fullscreen map view")
      : "Toggle sidebar");
  }
  setExpanded(isDesktop() ? !sidebar.classList.contains("is-collapsed") : sidebar.classList.contains("is-open"));

  button.addEventListener("click", () => {
    if (isDesktop()) {
      const isCollapsed = sidebar.classList.toggle("is-collapsed");
      document.body.classList.toggle("is-fullscreen", isCollapsed);
      setExpanded(!isCollapsed);
    } else {
      setExpanded(sidebar.classList.toggle("is-open"));
    }
    // The sidebar's width change (immediate on mobile's overlay transform,
    // transitioning on desktop's flex-basis/width) changes #map's own box
    // size, which Leaflet has no way to notice on its own -- nudge it to
    // recompute tile bounds now, and again once any transition settles.
    // (The header/footer collapse above isn't animated, so it's already
    // reflected in #map's size by the time this first invalidateSize() call
    // runs.)
    map.invalidateSize();
    sidebar.addEventListener("transitionend", () => map.invalidateSize(), { once: true });
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById("map").innerHTML =
    `<p class="load-error">Failed to load map data (${err.message}).` +
    ` Run <code>make render</code> and serve this directory to see the map.</p>`;
});
