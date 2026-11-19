#!/usr/bin/env bash
set -euo pipefail; umask 077
cd "$(dirname "$0")/.."
# Keep this directory on owner-controlled, backed-up storage, never in Git artifacts.
priv="${DEVVAULT_SIGN_DIR:-$PWD/../.devvault-signing}"
if [[ -e signing/release.pem || -e "$priv/release.key" ]]; then echo 'Signing identity already exists; refusing to replace it.' >&2; exit 1; fi
mkdir -p "$priv" signing; chmod 700 "$priv"
openssl rand -base64 42 > "$priv/key.pass"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -aes-256-cbc -pass file:"$priv/key.pass" -out "$priv/release.key" 2>/dev/null
openssl req -new -x509 -sha256 -days 10950 -subj '/CN=DEVVAULT Android Release/O=DEVVAULT/' -key "$priv/release.key" -passin file:"$priv/key.pass" -out signing/release.pem
chmod 644 signing/release.pem
openssl x509 -in signing/release.pem -noout -fingerprint -sha256
