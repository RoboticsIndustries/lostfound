#!/bin/sh
# Builds the web app into server/pb_public and zips the server folder into
# dist/lostfound-server.zip: the one file a school downloads to install Lost & Found.
set -e
cd "$(dirname "$0")/.."

(cd app && npm ci --no-audit --no-fund && npx expo export --platform web --output-dir ../server/pb_public --clear)

mkdir -p dist
rm -f dist/lostfound-server.zip
# Ship as a "lostfound" folder, without the downloaded binary or any school's data.
ln -sfn server lostfound
zip -qr dist/lostfound-server.zip lostfound/ -x 'lostfound/bin/*' 'lostfound/pb_data/*' '*.DS_Store'
rm lostfound
echo "Built dist/lostfound-server.zip"
