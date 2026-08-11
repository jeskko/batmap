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

  await initMarkers(map, worldInfo, ui, collapseState);
  setupAsciiLayerToggle(map, asciiLayer, asciiToggle, worldInfo.asciiZoomLevels || []);

  setupCursorReadout(map, worldInfo, document.getElementById("cursor-readout"));
  setupMakeLink(map, document.getElementById("make-link"), showToast, {
    routes: ui.routeLinesToggle, labels: ui.labelToggle, ascii: asciiToggle,
  }, () => ({ collapsed: collapseState.toArray().join(",") }));
  setupSidebarToggle();

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

function setupSidebarToggle() {
  const button = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  button.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById("map").innerHTML =
    `<p class="load-error">Failed to load map data (${err.message}).` +
    ` Run <code>make render</code> and serve this directory to see the map.</p>`;
});
