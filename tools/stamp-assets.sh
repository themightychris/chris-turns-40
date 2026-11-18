#!/usr/bin/env bash
# Stamp each linked asset with a short hash of its own content, so a changed
# file always gets a new address and a browser never pairs a new page with an
# old stylesheet or script. Run before every commit that touches an asset.
set -euo pipefail
cd "$(dirname "$0")/.."
for asset in style.css squadquest-rsvp.js shared/flyer-core.js shared/preview-stub.js; do
  v=$(sha1sum "$asset" | cut -c1-8)
  esc=${asset//./\\.}
  sed -i -E "s#(\"${esc})(\?v=[0-9a-z]+)?\"#\1?v=${v}\"#g" index.html preview.html
done
grep -ho '[a-z/.-]*\(css\|js\)?v=[0-9a-z]*' index.html preview.html | sort -u
