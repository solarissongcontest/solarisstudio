#!/usr/bin/env bash
set -euo pipefail

# The hostile rehearsal intentionally starts local Edge Functions in the
# background and probes them immediately. curl normally exits non-zero while a
# listener is still starting, which would interact badly with the rehearsal's
# `set -e` before it can inspect the emitted HTTP code. This wrapper preserves
# curl's output (including the normal 000 code on connection failure) but leaves
# success/failure decisions to the rehearsal's explicit HTTP assertions.
wrapper_dir="$(mktemp -d)"
real_curl="$(command -v curl)"
cleanup() { rm -rf "$wrapper_dir"; }
trap cleanup EXIT

cat >"$wrapper_dir/curl" <<EOF
#!/usr/bin/env bash
set +e
"$real_curl" "\$@"
exit 0
EOF
chmod +x "$wrapper_dir/curl"

PATH="$wrapper_dir:$PATH" bash .github/scripts/rules-integrity-security-rehearsal.sh
