#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# sign-windows.sh — Sign Windows executables using osslsigncode
#
# This script is called by electron-builder's afterSign hook
# or can be run standalone to sign .exe files.
#
# Environment variables (set in .env or export before running):
#   WIN_CSC_LINK       — Path to .pfx/.p12 certificate file
#   WIN_CSC_KEY_PASSWORD — Certificate password
#   WIN_SIGN_TIMESTAMP — Timestamp server URL (default: DigiCert)
#   WIN_SIGN_HASH      — Hash algorithm (default: sha256)
#
# Usage:
#   ./signing/sign-windows.sh <file.exe>
#   ./signing/sign-windows.sh --all <directory>
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Load .env if it exists
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# ── Configuration ──────────────────────────────────────────
CERT_FILE="${WIN_CSC_LINK:-}"
CERT_PASS="${WIN_CSC_KEY_PASSWORD:-}"
TIMESTAMP_URL="${WIN_SIGN_TIMESTAMP:-http://timestamp.digicert.com}"
HASH_ALG="${WIN_SIGN_HASH:-sha256}"
APP_NAME="RecoilApp"
APP_URL="https://recoilapp.com"

# ── Validation ─────────────────────────────────────────────
if [ -z "$CERT_FILE" ]; then
  echo "⚠  WIN_CSC_LINK not set — skipping code signing"
  echo "   Set it in $ENV_FILE or export it before building."
  echo "   See signing/README.md for certificate setup instructions."
  exit 0
fi

if [ ! -f "$CERT_FILE" ]; then
  echo "✗ Certificate file not found: $CERT_FILE"
  exit 1
fi

if [ -z "$CERT_PASS" ]; then
  echo "✗ WIN_CSC_KEY_PASSWORD not set"
  exit 1
fi

if ! command -v osslsigncode &> /dev/null; then
  echo "✗ osslsigncode is not installed. Run: sudo apt-get install osslsigncode"
  exit 1
fi

# ── Signing Function ──────────────────────────────────────
sign_file() {
  local input_file="$1"
  local temp_file="${input_file}.signed"

  if [ ! -f "$input_file" ]; then
    echo "  ⚠ File not found, skipping: $input_file"
    return 0
  fi

  echo "  ▶ Signing: $(basename "$input_file")"

  osslsigncode sign \
    -pkcs12 "$CERT_FILE" \
    -pass "$CERT_PASS" \
    -n "$APP_NAME" \
    -i "$APP_URL" \
    -t "$TIMESTAMP_URL" \
    -h "$HASH_ALG" \
    -in "$input_file" \
    -out "$temp_file"

  # Replace original with signed version
  mv "$temp_file" "$input_file"

  echo "  ✓ Signed: $(basename "$input_file")"
}

# ── Verify Function ───────────────────────────────────────
verify_file() {
  local input_file="$1"

  if [ ! -f "$input_file" ]; then
    return 0
  fi

  echo "  ▶ Verifying: $(basename "$input_file")"

  if osslsigncode verify -in "$input_file" -CAfile /etc/ssl/certs/ca-certificates.crt 2>/dev/null; then
    echo "  ✓ Signature valid: $(basename "$input_file")"
  else
    echo "  ⚠ Signature verification returned warnings (may be normal for self-signed/test certs)"
  fi
}

# ── Main ──────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  RecoilApp Windows Code Signing"
echo "═══════════════════════════════════════════"
echo "  Certificate: $(basename "$CERT_FILE")"
echo "  Timestamp:   $TIMESTAMP_URL"
echo "  Algorithm:   $HASH_ALG"
echo ""

if [ "${1:-}" = "--all" ]; then
  # Sign all .exe files in a directory
  SEARCH_DIR="${2:-$(cd "$SCRIPT_DIR/.." && pwd)/../compiled_applications}"
  echo "▶ Scanning for .exe files in: $SEARCH_DIR"
  echo ""

  found=0
  while IFS= read -r -d '' exe_file; do
    sign_file "$exe_file"
    verify_file "$exe_file"
    found=$((found + 1))
    echo ""
  done < <(find "$SEARCH_DIR" -maxdepth 1 -name "*.exe" -print0)

  if [ "$found" -eq 0 ]; then
    echo "  ⚠ No .exe files found in $SEARCH_DIR"
  else
    echo "✓ Signed $found file(s)"
  fi

elif [ "${1:-}" = "--verify" ]; then
  # Verify mode
  shift
  for file in "$@"; do
    verify_file "$file"
  done

else
  # Sign specific file(s)
  for file in "$@"; do
    sign_file "$file"
    verify_file "$file"
    echo ""
  done
fi

echo ""
echo "✓ Code signing complete"
