#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-examples.sh
#
# Verifies that every example in examples/ compiles against the built SDK,
# catching breaking API changes early.
#
# For Vite HTML-only examples:  Extracts <script type="module"> imports from
#   index.html, writes a temporary .ts file inside the example directory (so
#   module resolution finds the workspace-linked SDK), and runs tsc --noEmit.
#
# For examples with standalone .ts/.tsx files (proxy servers, Next.js):
#   Runs tsc --noEmit on just the SDK-importing files.
#
# Prerequisites: pnpm install && pnpm run build  (SDK dist/ must exist)
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLES_DIR="$REPO_ROOT/examples"

passed=0
failed=0
skipped=0
failed_names=()

# Colours (disabled when stdout is not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; NC=''
fi

# ---------------------------------------------------------------------------
# check_vite_example <example_dir>
#
# Extracts import statements from index.html's inline <script type="module">
# block, writes them to a temp .ts file inside the example dir, and
# type-checks against the SDK.
# ---------------------------------------------------------------------------
check_vite_example() {
  local example_dir="$1"
  local example_name
  example_name="$(basename "$example_dir")"
  local html_file="$example_dir/index.html"

  if [ ! -f "$html_file" ]; then
    printf "  ${YELLOW}SKIP${NC}  %-45s (no index.html)\n" "$example_name"
    skipped=$((skipped + 1))
    return 0
  fi

  # Write the temp file inside the example directory so tsc can resolve
  # @lukeocodes/composite-voice via the workspace symlink in node_modules.
  local ts_file="$example_dir/__check_imports.ts"

  python3 - "$html_file" "$ts_file" << 'PYEOF'
import re, sys

html_path, ts_path = sys.argv[1], sys.argv[2]

with open(html_path) as f:
    content = f.read()

# Find all <script type="module"> blocks
script_blocks = re.findall(
    r'<script\s+type=["\']module["\']>(.*?)</script>',
    content, re.DOTALL
)

imports = []
for block in script_blocks:
    # Match import { ... } from '...' (including multi-line)
    for m in re.finditer(
        r"(import\s*\{[^}]+\}\s*from\s*['\"][^'\"]+['\"])\s*;?",
        block, re.DOTALL
    ):
        stmt = m.group(1).strip()
        # Normalize whitespace
        stmt = re.sub(r'\s+', ' ', stmt)
        imports.append(stmt + ';')

with open(ts_path, 'w') as f:
    # Write the imports only — tsc --noEmit verifies they resolve
    for imp in imports:
        f.write(imp + '\n')
    # Suppress "file has no statements" if empty
    if not imports:
        f.write('export {};\n')
PYEOF

  # If the generated file only has `export {};`, there are no SDK imports
  if ! grep -q '@lukeocodes/composite-voice' "$ts_file" 2>/dev/null; then
    rm -f "$ts_file"
    printf "  ${YELLOW}SKIP${NC}  %-45s (no SDK imports in HTML)\n" "$example_name"
    skipped=$((skipped + 1))
    return 0
  fi

  # Type-check the extracted imports.
  # moduleResolution: bundler is needed to resolve package.json "exports" subpaths.
  local output
  if output=$(cd "$example_dir" && "$REPO_ROOT/node_modules/.bin/tsc" \
    --noEmit \
    --moduleResolution bundler \
    --module esnext \
    --target es2020 \
    --lib es2020,dom \
    --skipLibCheck \
    "__check_imports.ts" 2>&1); then
    printf "  ${GREEN}PASS${NC}  %-45s\n" "$example_name"
    passed=$((passed + 1))
  else
    printf "  ${RED}FAIL${NC}  %-45s\n" "$example_name"
    # Sanitize temp filename from error output for clarity
    echo "$output" | sed "s|__check_imports.ts|${example_name}/index.html (extracted)|g" | head -20 | sed 's/^/        /'
    failed=$((failed + 1))
    failed_names+=("$example_name")
  fi

  rm -f "$ts_file"
}

# ---------------------------------------------------------------------------
# check_ts_example <example_dir>
#
# For standalone .ts/.tsx files that import the SDK: extracts only the SDK
# import lines, writes a temp file, and type-checks it.  This avoids false
# positives from missing third-party types (e.g., express, react).
# ---------------------------------------------------------------------------
check_ts_example() {
  local example_dir="$1"
  local example_name
  example_name="$(basename "$example_dir")"

  # Collect .ts/.tsx files (excluding test/build artifacts)
  local ts_files=()
  while IFS= read -r f; do
    ts_files+=("$f")
  done < <(find "$example_dir" \
    \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/e2e/*' \
    -not -path '*/node_modules/*' \
    -not -path '*/.next/*' \
    -not -path '*/dist/*' \
    -not -name 'next-env.d.ts' \
    -not -name '__check_imports.ts' \
    | sort)

  if [ ${#ts_files[@]} -eq 0 ]; then
    return 0  # No TS files — handled by vite check
  fi

  # Filter to only files that reference the SDK
  local sdk_files=()
  for f in "${ts_files[@]}"; do
    if grep -q '@lukeocodes/composite-voice' "$f" 2>/dev/null; then
      sdk_files+=("$f")
    fi
  done

  if [ ${#sdk_files[@]} -eq 0 ]; then
    return 0  # TS files exist but don't import SDK — skip
  fi

  # Extract SDK imports from all TS files into a single check file.
  # This isolates us from third-party dependency issues while still verifying
  # that the SDK exports match what the example code expects.
  local ts_check="$example_dir/__check_ts_imports.ts"

  python3 - "$ts_check" "${sdk_files[@]}" << 'PYEOF'
import re, sys

out_path = sys.argv[1]
source_files = sys.argv[2:]

imports = []
for src in source_files:
    with open(src) as f:
        content = f.read()
    # Strip template literal strings to avoid matching imports inside code examples
    content = re.sub(r'`[^`]*`', '""', content, flags=re.DOTALL)
    for m in re.finditer(
        r"(import\s*(?:type\s*)?\{[^}]+\}\s*from\s*['\"]@lukeocodes/composite-voice(?:/[^'\"]*)?['\"])\s*;?",
        content, re.DOTALL
    ):
        # Skip UI package imports — only check SDK imports
        if '-ui' in m.group(0):
            continue
        stmt = m.group(1).strip()
        stmt = re.sub(r'\s+', ' ', stmt)
        imports.append(stmt + ';')

seen = set()
unique = []
for imp in imports:
    if imp not in seen:
        seen.add(imp)
        unique.append(imp)

with open(out_path, 'w') as f:
    for imp in unique:
        f.write(imp + '\n')
    if not unique:
        f.write('export {};\n')
PYEOF

  if ! grep -q '@lukeocodes/composite-voice' "$ts_check" 2>/dev/null; then
    rm -f "$ts_check"
    return 0
  fi

  local label="ts"
  # Describe what we found
  if [ ${#sdk_files[@]} -eq 1 ]; then
    label="$(basename "${sdk_files[0]}")"
  fi

  local output
  if output=$(cd "$example_dir" && "$REPO_ROOT/node_modules/.bin/tsc" \
    --noEmit \
    --moduleResolution bundler \
    --module esnext \
    --target es2020 \
    --lib es2020,dom \
    --jsx react-jsx \
    --esModuleInterop \
    --skipLibCheck \
    "__check_ts_imports.ts" 2>&1); then
    printf "  ${GREEN}PASS${NC}  %-45s (%s)\n" "$example_name" "$label"
    passed=$((passed + 1))
  else
    printf "  ${RED}FAIL${NC}  %-45s (%s)\n" "$example_name" "$label"
    echo "$output" | sed "s|__check_ts_imports.ts|${example_name}/${label} (extracted)|g" | head -20 | sed 's/^/        /'
    failed=$((failed + 1))
    failed_names+=("$example_name ($label)")
  fi

  rm -f "$ts_check"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo ""
echo "Checking examples compile against SDK..."
echo "========================================="
echo ""

# Verify the SDK has been built
if [ ! -d "$REPO_ROOT/dist" ]; then
  echo "ERROR: dist/ not found. Run 'pnpm run build' first."
  exit 1
fi

# Process each example directory
for example_dir in "$EXAMPLES_DIR"/*/; do
  [ -d "$example_dir" ] || continue
  example_name="$(basename "$example_dir")"

  # Skip non-example directories
  if [ "$example_name" = ".review" ] || [ "$example_name" = "node_modules" ]; then
    continue
  fi

  # Check standalone TS files (server.ts, Next.js app files)
  check_ts_example "$example_dir"

  # Check HTML inline imports (Vite examples)
  if [ -f "$example_dir/index.html" ]; then
    check_vite_example "$example_dir"
  elif [ ! -f "$example_dir/tsconfig.json" ]; then
    # No HTML and no tsconfig — unusual, report it
    printf "  ${YELLOW}SKIP${NC}  %-45s (no index.html or tsconfig)\n" "$example_name"
    skipped=$((skipped + 1))
  fi
done

echo ""
echo "========================================="
echo "Results: ${passed} passed, ${failed} failed, ${skipped} skipped"

if [ ${#failed_names[@]} -gt 0 ]; then
  echo ""
  echo "Failed examples:"
  for name in "${failed_names[@]}"; do
    echo "  - $name"
  done
fi

echo ""

if [ "$failed" -gt 0 ]; then
  exit 1
fi
