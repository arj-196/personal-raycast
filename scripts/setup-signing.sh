#!/bin/zsh
# Creates a self-signed code-signing certificate in the login keychain, once. build-app.sh signs
# with it, so the app's identity (bundle ID + certificate) stays the same across rebuilds and macOS
# keeps the Accessibility grant. Ad-hoc signatures identify the exact binary and break it every build.
set -euo pipefail

NAME="Personal Raycast Local Signing"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-certificate -c "$NAME" "$KEYCHAIN" >/dev/null 2>&1; then
  echo "✓ \"$NAME\" already exists"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/cert.cnf" <<CNF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CNF

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$TMP/cert.cnf" -extensions ext \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null
# A throwaway password: `security import` can't read an unencrypted PKCS#12.
openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -name "$NAME" \
  -passout pass:prc -out "$TMP/identity.p12"
# -T lets codesign use the key without a keychain prompt.
security import "$TMP/identity.p12" -k "$KEYCHAIN" -P prc -T /usr/bin/codesign
echo "✓ created \"$NAME\" in the login keychain"
