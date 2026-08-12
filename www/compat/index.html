<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>BatMUD World Map has moved</title>
<!--
  Drop-in replacement for the old gmap2 site's index.php.

  This file is intentionally plain HTML + JS with NO "<?php" tags -- it is
  meant to be copied over the old /gmap2/index.php as-is. A PHP handler
  serving a .php file with no PHP code in it just outputs the file
  verbatim, so this works whether or not PHP is still wired up for that
  path. See README.md in this directory for the deployment step (copying
  this file elsewhere on the same webhost is NOT something `make install`
  does for you -- gmap2/ isn't part of this repo's own build output).

  Old permalinks looked like:
    /gmap2/index.php?x=<int>&y=<int>&zoom=<int>
    /gmap2/index.php?name=<string>&token=<string>[&x=..&y=..&zoom=..]
  (see old/gmap2/index.php's $jsTokens and old/gmap2/map.js's
  pmapMakeLink() -- those are the only params the old site ever read or
  generated). This page reads the same query params from the URL,
  converts them, and forwards to the new site's equivalent view.
-->
<style>
  html, body {
    height: 100%;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #171310;
    color: #f4ece0;
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  }
  main { max-width: 32em; padding: 2em; text-align: center; }
  a { color: #ffc2a1; }
</style>
</head>
<body>

<main>
  <p>The BatMUD World Map has moved. Redirecting you to the new map&hellip;</p>
  <p>If you are not redirected automatically,
    <a id="fallback-link" href="/map/?labels=1&amp;ascii=1">click here</a>.</p>
</main>

<!-- Only fires if JavaScript doesn't run at all -- otherwise the script
     below replaces the location before this would trigger, and we don't
     want both racing. Can't carry over the old position/player params
     without JS to read them, but at least keeps the labels/ascii
     defaults consistent with the JS path below. -->
<noscript><meta http-equiv="refresh" content="0; url=/map/?labels=1&amp;ascii=1"></noscript>

<script>
(function () {
  "use strict";

  // Where the new site lives on this webhost. Root-relative so it works
  // regardless of how deep /gmap2/ itself is served from.
  var NEW_SITE_BASE = "/map/";

  // Old site's x/y permalink params were always given in its fixed
  // "zoom level 6" pixel space (old/gmap2/map.js: pmapMapCoordsToLatLng
  // calls hardcode 6, independent of the display `zoom` param) -- which is
  // exactly the new site's native/Leaflet-zoom-0 pixel space (see
  // www/js/coords.js's NATIVE_ZOOM_OFFSET). So x/y need no conversion at
  // all; only the *display* zoom level needs shifting by this offset to
  // go from the old site's Google-Maps-style zoom numbering to the new
  // site's Leaflet zoom numbering. Keep this in sync with
  // www/js/coords.js's NATIVE_ZOOM_OFFSET if that ever changes.
  var NATIVE_ZOOM_OFFSET = 6;

  var oldParams = new URLSearchParams(window.location.search);

  function param(key) {
    var v = oldParams.get(key);
    return v !== null && v !== "" ? v : null;
  }

  var x = param("x");
  var y = param("y");
  var zoom = param("zoom");
  var name = param("name");
  var token = param("token");

  var newParams = new URLSearchParams();

  // The old site always showed marker text labels (every marker used the
  // MarkerWithLabel plugin unconditionally -- see old/gmap2/markers.js;
  // there was no toggle to turn labels off) and, per the old site's own
  // default look and feel, the text/ASCII map layer too -- so every link
  // through here turns both on explicitly rather than leaving them at the
  // new site's own (off) defaults.
  newParams.set("labels", "1");
  newParams.set("ascii", "1");

  // x/y are only meaningful together (matching old index.php's own
  // combined "zoom" + "x" + "y" guard around pmap.panTo/setZoom).
  if (x !== null && y !== null) {
    newParams.set("x", x);
    newParams.set("y", y);

    if (zoom !== null && !isNaN(Number(zoom))) {
      newParams.set("zoom", String(Math.trunc(Number(zoom)) - NATIVE_ZOOM_OFFSET));
    }
  }

  // name/token were also only ever meaningful together on the old site
  // (both had to be non-empty for it to place the player-portrait
  // marker) -- x/y (if present) ride along too, since the new site's
  // player marker needs a position to render at all, unlike the old
  // site's own buggy "always at world origin" placement.
  if (name !== null && token !== null) {
    newParams.set("name", name);
    newParams.set("token", token);
  }

  var query = newParams.toString();
  var target = NEW_SITE_BASE + (query ? "?" + query : "");

  document.getElementById("fallback-link").href = target;
  // replace(), not assigning .href, so the dead old URL doesn't linger as
  // a back-button stop.
  window.location.replace(target);
})();
</script>

</body>
</html>
