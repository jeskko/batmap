# Top-level build orchestration for batmap.
#
# Data flow: extern/maputils (hg checkout of game-world data) -> utils/
# (Python: tiles + markers/tradelane JSON) -> www/ (static frontend) ->
# installed into WWW_DIR for serving.
#
# Common usage:
#   make render            # rebuild tiles/data locally, no network access
#   make update             # pull latest maputils data, then render
#   make install WWW_DIR=/var/www/batmap
#   make clean

MAPUTILS_DIR ?= extern/maputils
MAPUTILS_URL ?= https://tnsp.org/hg/batmud/maputils/

BUILD_DIR ?= build
PYTHON    ?= python3
VENV_DIR  ?= .venv-utils

WWW_DIR         ?= /var/www/batmap
TILES_DIR       ?= $(WWW_DIR)/tiles
ASCII_TILES_DIR ?= $(WWW_DIR)/tiles-ascii
DATA_DIR        ?= $(WWW_DIR)/data

# Optional local overrides (gitignored), e.g. to pin WWW_DIR for this host.
-include config.mk

.PHONY: all venv fetch-data update render install clean distclean

all: render

# --- Python environment -----------------------------------------------

venv:
	test -d $(VENV_DIR) || $(PYTHON) -m venv $(VENV_DIR)
	$(VENV_DIR)/bin/pip install -q -r utils/requirements.txt

# --- Game world data (network-dependent, kept separate from render) ---

fetch-data:
	@if [ -d $(MAPUTILS_DIR)/.hg ]; then \
		echo "* Updating $(MAPUTILS_DIR)"; \
		cd $(MAPUTILS_DIR) && hg pull && hg update; \
	else \
		echo "* Cloning $(MAPUTILS_URL) into $(MAPUTILS_DIR)"; \
		hg clone $(MAPUTILS_URL) $(MAPUTILS_DIR); \
	fi

update: fetch-data render

# --- Local build (tiles + markers/tradelane JSON), no network ---------
# batmap_build is a package under utils/, so point Python at it via
# PYTHONPATH rather than requiring an install step.

render: venv
	PYTHONPATH=utils $(VENV_DIR)/bin/python -m batmap_build.build \
		--maputils $(MAPUTILS_DIR) --out $(BUILD_DIR)

# --- Deploy: static site + generated tiles/data into WWW_DIR ----------
# Destructive by design (--delete): the continent set/sizes have been
# stable for well over a decade, so stale leftovers under WWW_DIR are far
# more likely than a legitimate need to preserve old tiles.

install: render
	mkdir -p $(WWW_DIR) $(TILES_DIR) $(ASCII_TILES_DIR) $(DATA_DIR)
	# compat/ is the old-site (gmap2/) permalink shim -- it's deployed by
	# hand into that separate, unrelated directory (see www/compat/README.md),
	# not shipped as part of this site's own output.
	rsync -a --delete www/ $(WWW_DIR)/ --exclude tiles --exclude tiles-ascii --exclude data --exclude compat
	rsync -a --delete $(BUILD_DIR)/tiles/       $(TILES_DIR)/
	rsync -a --delete $(BUILD_DIR)/tiles-ascii/  $(ASCII_TILES_DIR)/
	rsync -a --delete $(BUILD_DIR)/data/         $(DATA_DIR)/
	# "Site updated" (the footer's other timestamp, alongside world.json's
	# data-driven "Map data updated") -- deliberately stamped here rather
	# than by build.py: it's meant to track an actual deploy via `make
	# install`, not just a local `make render` that never gets installed
	# anywhere. Written after the data/ rsync above so it isn't immediately
	# wiped by that same --delete.
	echo "{\"date\": \"$$(date -u +%Y-%m-%d)\"}" > $(DATA_DIR)/site_updated.json

clean:
	rm -rf $(BUILD_DIR)

distclean: clean
	rm -rf $(VENV_DIR)
