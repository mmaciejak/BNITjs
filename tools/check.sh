#!/usr/bin/env bash
# Run every test suite. Use before each commit (SPEC §4: commit only when tests pass).
#
#   tools/check.sh            # everything
#   SKIP_PARITY=1 tools/check.sh
#
# BLENDER_42 / BLENDER_LATEST point at the Blender binaries (defaults: this machine's paths).
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER_42=${BLENDER_42:-"/Applications/Blender 2.app/Contents/MacOS/Blender"}
BLENDER_LATEST=${BLENDER_LATEST:-"/Applications/Blender 5.app/Contents/MacOS/Blender"}
export BLENDER_USER_RESOURCES=${BLENDER_USER_RESOURCES:-$(mktemp -d)}

step() { printf '\n== %s\n' "$1"; }

step "python lint"
ruff check . && ruff format --check .
python3 tools/sync_node_support.py --check

for blender in "$BLENDER_42" "$BLENDER_LATEST"; do
  step "exporter tests: $("$blender" --version | head -1)"
  if ! out=$("$blender" -b --factory-startup --python exporter/tests/run_tests.py 2>&1); then
    echo "$out" | grep -vE '^(Blender |Read |$)'
    exit 1
  fi
  echo "$out" | grep -E '^(Ran|OK)'
done

step "runtime"
(cd runtime && npm run lint --silent && npm run typecheck --silent && npm test --silent && npm run build --silent >/dev/null)

if [[ -z "${SKIP_PARITY:-}" ]]; then
  step "parity references"
  "$BLENDER_LATEST" -b --factory-startup --python parity/render_refs.py 2>&1 | grep -E '^parity:' | wc -l | xargs echo "rendered"
  step "parity (WebGPU)"
  (cd runtime && npm run parity --silent | tail -1)
  step "parity (WebGL2)"
  (cd runtime && npm run parity --silent -- --webgl | tail -1)
fi
printf '\nAll checks passed.\n'
