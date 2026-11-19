#!/usr/bin/env bash
# This uses the stock, pinned Capacitor Android host, not a custom Java application.
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/build-web.sh
if [[ ! -d android ]]; then ./node_modules/.bin/cap add android; fi
./node_modules/.bin/cap sync android
ruby scripts/platform.rb
(cd android && ./gradlew --no-daemon --console=plain assembleRelease)
mkdir -p out
cp android/app/build/outputs/apk/release/app-release-unsigned.apk "out/devvault-$(cat VERSION)-unsigned.apk"
