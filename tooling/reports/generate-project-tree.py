#!/usr/bin/env python3
"""Generate docs/reference/project-tree.txt from the live filesystem."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/reference/project-tree.txt"

# Only git-TRACKED paths are listed, so the tree is identical on every machine
# and in CI — gitignored/untracked local files (.env.local, scratch logs,
# etc.) never leak in. Empty set = git unavailable → fall back to the raw walk.
def _tracked_paths() -> set[str]:
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except Exception:
        return set()
    paths: set[str] = set()
    for f in filter(None, out.split("\0")):
        parts = f.split("/")
        for i in range(1, len(parts) + 1):
            paths.add("/".join(parts[:i]))  # file + every ancestor dir
    return paths


TRACKED: set[str] = _tracked_paths()


def _is_tracked(p: Path) -> bool:
    return not TRACKED or p.relative_to(ROOT).as_posix() in TRACKED

IGNORE_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "coverage",
    ".turbo",
    ".next",
    "build",
    ".pnpm-store",
    "test-results",
    "__pycache__",
    ".stryker-tmp",
    # Gitignored, machine-local codegraph index + daemon runtime (daemon.pid /
    # .sock / .db-shm|wal are transient and per-machine) — never part of the tree.
    ".codegraph",
}
IGNORE_FILES = {".DS_Store", "settings.local.json", "state.json", "pnpm-lock.yaml"}
SKIP_TOP = {".claude", ".cursor"}


def is_test(name: str) -> bool:
    return ".test." in name or name.endswith((".spec.ts", ".spec.tsx"))


def count_in(path: Path, pred=None) -> int:
    if not path.exists():
        return 0
    n = 0
    for p in path.rglob("*"):
        if p.is_file() and _is_tracked(p) and not any(x in p.parts for x in IGNORE_DIRS):
            if pred is None or pred(p.name):
                n += 1
    return n


def tree(
    path: Path,
    prefix: str = "",
    depth: int = 0,
    max_depth: int = 6,
    collapse_tests: bool = True,
) -> list[str]:
    if depth > max_depth:
        return []
    lines: list[str] = []
    try:
        entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return []
    entries = [
        e
        for e in entries
        if e.name not in IGNORE_DIRS and e.name not in IGNORE_FILES and _is_tracked(e)
    ]
    if depth == 0:
        entries = [e for e in entries if e.name not in SKIP_TOP]

    # Collapse agent-os/skills into one summary line
    if path.name == "agent-os" and depth == 1:
        skill_count = len([e for e in (path / "skills").iterdir() if e.is_dir()]) if (path / "skills").exists() else 0
        collapsed: list[str] = []
        for entry in entries:
            if entry.name == "skills":
                collapsed.append((entry, f"skills/  ({skill_count} skills: fe-auto-implement, shadcn, fe-route-island, …)", True))
            elif entry.is_dir():
                collapsed.append((entry, f"{entry.name}/", False))
            else:
                collapsed.append((entry, entry.name, False))
        items = collapsed
    else:
        items = [(e, f"{e.name}/" if e.is_dir() else e.name, False) for e in entries if not (e.name == "_" and e.is_dir())]

    # Split dirs vs files for test collapse
    dir_items = [(e, lbl, skip) for e, lbl, skip in items if e.is_dir() or (not e.is_dir() and not is_test(e.name))]
    test_files = [e for e, _, _ in items if e.is_file() and is_test(e.name)]

    for i, (entry, label, skip_recurse) in enumerate(dir_items):
        is_last = i == len(dir_items) - 1 and (not collapse_tests or not test_files)
        conn = "└── " if is_last else "├── "
        lines.append(f"{prefix}{conn}{label}")
        if entry.is_dir() and not skip_recurse:
            # Special collapses
            if entry.name == "ui" and entry.parent.name == "components":
                continue
            if entry.name == "stacks" and "ui-ux-pro-max" in str(entry):
                continue
            if entry.name == "data" and "ui-ux-pro-max" in str(entry):
                ext = "    " if is_last else "│   "
                csv_n = len(list(entry.glob("*.csv")))
                lines.append(f"{prefix}{ext}├── stacks/  (16 stack CSVs)")
                lines.append(f"{prefix}{ext}└── {csv_n} design/UX CSVs")
                continue
            ext = "    " if is_last else "│   "
            lines.extend(tree(entry, prefix + ext, depth + 1, max_depth, collapse_tests))

    if collapse_tests and test_files:
        lines.append(f"{prefix}└── [{len(test_files)} test file{'s' if len(test_files) != 1 else ''}]")
    return lines


def main() -> None:
    src_ts = count_in(ROOT / "src", lambda n: not is_test(n) and n.endswith((".ts", ".tsx")))
    src_tests = count_in(ROOT / "src", is_test)
    e2e = count_in(ROOT / "tests/e2e")
    ui_n = count_in(ROOT / "src/shared/components/ui", lambda n: n.endswith(".tsx"))

    header = f"""# core-fe — Project File Tree
Generated: auto (python3 tooling/reports/generate-project-tree.py)
Regenerate: python3 tooling/reports/generate-project-tree.py

> Architecture reference. Live routes: docs/reference/routes-and-ui.md
> Excluded: node_modules, .git, dist, coverage, .pnpm-store, test-results, __pycache__
> .cursor/ and .claude/ symlink to agent-os/ (listed once)

================================================================================
§1  ARCHITECTURE
================================================================================

Dependency flow:  ui → lib → core → shared → pages → app (one-way)

Layer          Purpose
─────────────  ─────────────────────────────────────────────────────────
src/app/       Route tree, guards, providers, observability, analytics
src/core/      HTTP, RBAC, config, data-provider, resources, version
src/pages/     Route islands (folder-per-unit: Component/, hooks/, forms/)
src/shared/    UI, auth, api, errors, forms, hooks, layouts, store (Zustand)
src/lib/       Pure utilities, animations, route-island helpers
tests/         E2E, utils (project root)

Stats: ~{src_ts} src files · ~{src_tests} tests in src/ · {e2e} E2E specs · {ui_n} shadcn UI primitives

================================================================================
§2  FULL DIRECTORY TREE
================================================================================

"""

    body = tree(ROOT)
    footer = """
================================================================================
§3  KEY CONVENTIONS
================================================================================

Route island (pages/<name>/):
  *.page.ts | *.route.tsx | *.OVERVIEW.md | components/<Unit>/ | hooks/<hook>/ | forms/<Form>/
  <page>.api.ts | <page>.contracts.ts | __tests__/integration/

Shared folder-per-unit:
  components/<Name>/index.tsx   hooks/useList/   forms/ProfileForm/
  store/useThemeStore/          api/             auth/

Tests:
  everywhere    → colocated *.test.ts(x) next to source (folder-per-unit)
  shared/core  → colocated *.test.ts(x) next to source OR in unit folder

"""

    content = header + "core-fe/\n" + "\n".join(body) + footer
    rel = OUT.relative_to(ROOT)

    # --check: compare against the committed file and fail on drift, without
    # writing. Lets the tree be verified in CI / a review without a side effect.
    if "--check" in sys.argv[1:]:
        current = OUT.read_text() if OUT.exists() else ""
        if current != content:
            print(
                f"✖ {rel} is out of date. Regenerate with: "
                "pnpm tool:project-structure-tree",
                file=sys.stderr,
            )
            raise SystemExit(1)
        print(f"{rel} is up to date.")
        return

    OUT.write_text(content)
    print(f"Wrote {rel} ({len(content.splitlines())} lines)")


if __name__ == "__main__":
    main()
