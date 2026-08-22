#!/usr/bin/env bash
# Fetch and simplify the Natural Earth India point-of-view boundaries.
#
# Separate from geo.mjs because it is slow, network-bound, and rarely rerun — the source
# changes maybe once a year. geo.mjs then runs in a second against the simplified output.
#
# See geo.mjs for why the India POV edition is used and what that means factually.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../../geo" && pwd)/ne_pov"
BASE="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/10m_cultural"
NAME="ne_10m_admin_0_countries_ind"

mkdir -p "$DIR"
for ext in shp dbf shx prj; do
  if [ ! -f "$DIR/$NAME.$ext" ]; then
    echo "fetching $NAME.$ext"
    curl -sL --fail -m 300 "$BASE/$NAME.$ext" -o "$DIR/$NAME.$ext"
  fi
done

# Topology-preserving simplification. Independent per-polygon simplification would open
# gaps along every shared border; mapshaper simplifies each shared arc exactly once.
# 1.2% retains enough shape at world zoom while keeping the payload near 400 KB.
npx -y mapshaper@0.6.102 "$DIR/$NAME.shp" \
  -simplify percentage=1.2% keep-shapes \
  -filter-fields ISO_A3,ADM0_A3,NAME,SOV_A3 \
  -o format=geojson precision=0.001 "$DIR/india_pov.geojson"

echo "prepared $DIR/india_pov.geojson"
