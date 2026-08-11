/*
 * Shared collapsible-section plumbing for the sidebar (filter groups, the
 * "Locations" wrapper, and each continent's location group).
 *
 * Collapsed state is deliberately NOT persisted via localStorage -- it's
 * tracked in-memory here and folded into the same "Copy link to this view"
 * share-link mechanism the route-lines/labels/ascii toggles already use
 * (see map.js's setupMakeLink/getDeepLinkParams), so a shared link
 * reproduces the sender's sidebar layout too instead of silently differing
 * per browser/device.
 */

/** @param initialIds string[] of section ids collapsed at page load (from a deep link). */
export function createCollapseState(initialIds) {
  const collapsed = new Set(initialIds);
  return {
    has: (id) => collapsed.has(id),
    set(id, isCollapsed) {
      if (isCollapsed) collapsed.add(id);
      else collapsed.delete(id);
    },
    toArray: () => [...collapsed],
  };
}

/**
 * Wires a plain collapsible section: clicking `headerEl` toggles a
 * `.is-collapsed` class on `sectionEl` (CSS hides the section's body based
 * on that class), tracked under `id` in the shared collapse state.
 */
export function makeCollapsible(headerEl, sectionEl, id, state) {
  function apply(isCollapsed) {
    sectionEl.classList.toggle("is-collapsed", isCollapsed);
    headerEl.setAttribute("aria-expanded", String(!isCollapsed));
  }

  apply(state.has(id));
  headerEl.addEventListener("click", () => {
    const isCollapsed = !sectionEl.classList.contains("is-collapsed");
    apply(isCollapsed);
    state.set(id, isCollapsed);
  });
}
