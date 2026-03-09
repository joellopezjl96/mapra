# Multi-Language Support & Freshness Detection

**Date:** 2026-03-08
**Status:** Draft
**Scope:** Two independent features that address strand's biggest adoption blockers

---

## Part A: Multi-Language Support

### Problem Statement

strand's scanner (`src/scanner/index.ts`) is hardcoded to TypeScript/JavaScript:

- `isSourceFile()` only matches `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.prisma`
- `extractImports()` uses a regex for ES `import ... from` and CommonJS `require()`
- `extractExports()` uses a regex for `export function|const|class|type|interface|enum`
- `detectPathAliases()` reads `tsconfig.json` `compilerOptions.paths`
- `findNodeByImport()` tries TS/JS extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, etc.
- `detectFramework()` reads `package.json` and checks for `next`, `react`, `express`, `vue`, `svelte`
- `classifyFile()` uses TS/JS test patterns (`.test.ts`, `.spec.ts`, `__tests__/`)

This cuts out Python, Go, Rust, Java, C#, Ruby, PHP — the majority of the market. The analysis and encoder layers are largely language-agnostic (they operate on `StrandGraph`), but the scanner is a complete TS/JS silo.

### What Is Already Language-Agnostic

These modules operate on the `StrandGraph` abstraction and need zero changes:

| Module | Why it works as-is |
|--------|--------------------|
| `src/analyzer/blast-radius.ts` | BFS on reverse adjacency — language-irrelevant |
| `src/analyzer/graph-utils.ts` | Generic adjacency/BFS/module-ID utilities |
| `src/analyzer/churn.ts` | Shells out to `git log --numstat` — works for any file type |
| `src/analyzer/conventions.ts` | Counts shared dependencies by node type — generic |
| `src/encoder/strand-format-encode.ts` | Renders from `StrandGraph` — no language assumptions except `classifyEdge()` domain heuristics and `shortenPath()` stripping `.ts` extensions |

**Encoder tweaks needed:** `shortenPath()` strips `.ts/.tsx/.js/.jsx` extensions. It must also strip `.py`, `.go`, `.rs`, `.java`, etc. This is a one-line regex change.

### What Needs Per-Language Implementation

| Function | TS/JS behavior | Per-language equivalent |
|----------|---------------|----------------------|
| `isSourceFile(name)` | Regex for `.ts/.tsx/.js/.jsx/.mjs/.cjs/.prisma` | File extension set per language |
| `extractImports(content)` | Regex for `import ... from` + `require()` | Language-specific import syntax |
| `extractExports(content)` | Regex for `export function/const/class/...` | Language-specific export/public API syntax |
| `detectPathAliases(rootDir)` | Reads `tsconfig.json` paths | `pyproject.toml`, `go.mod`, `Cargo.toml`, etc. |
| `findNodeByImport(resolvedPath, nodeMap)` | Tries `.ts`, `.tsx`, `.js`, etc. extensions | `.py`, `.go`, `.rs`, `.java`, etc. |
| `classifyFile(relativePath, content, framework)` | TS/JS test patterns, Next.js routes, React components | pytest patterns, Go `_test.go`, Rust `#[cfg(test)]`, etc. |
| `detectFramework(rootDir)` | Reads `package.json` deps | Detect Django, Flask, Gin, Actix, Spring, etc. |
| `extractFrameworkMetadata(...)` | Next.js routes, Prisma models | Framework-specific metadata per ecosystem |

### Design Options

#### Option 1: Language-Specific Scanner Modules

Create a `LanguagePlugin` interface. Each language gets its own module implementing it. The scanner dispatches based on file extension.

```typescript
interface LanguagePlugin {
  extensions: string[];                            // [".py"]
  extractImports(content: string): string[];
  extractExports(content: string): string[];
  resolveImportPath(importPath: string, fromPath: string, rootDir: string): string | null;
  findExtensions(): string[];                      // [".py", "/init.py"]
  classifyFile(relativePath: string, content: string): StrandNode["type"];
  detectFramework?(rootDir: string): FrameworkInfo | null;
  detectPathAliases?(rootDir: string): Map<string, string>;
}
```

**Pros:**
- Clean separation. Each language plugin is independently testable.
- Contributors can add a language without understanding the full scanner.
- Regex-based — no native dependencies. `npx strnd` works everywhere.
- Matches what we already have (the TS/JS scanner is effectively this interface already, just inlined).

**Cons:**
- Regex import extraction is brittle for languages with complex syntax (e.g., Rust's `mod` and `use` paths, Java's wildcard imports).
- N plugins to maintain.

#### Option 2: Tree-Sitter Grammars

Use tree-sitter to parse every language's AST. Extract imports/exports by walking the syntax tree.

**Pros:**
- Correct parsing — handles edge cases that regex misses.
- One parsing strategy for all languages.

**Cons:**
- **strand already removed tree-sitter** (commit: `chore: remove dead tree-sitter dependencies`). It was a native compiled dependency that caused `npx strnd` install failures on non-standard environments. Re-adding it reintroduces the exact problem that was solved.
- tree-sitter grammars are ~5-10MB per language. Supporting 5 languages adds 25-50MB to the install.
- tree-sitter requires `node-gyp` build toolchain — breaks on many CI environments and Windows machines without Visual Studio.
- Overkill for import extraction, which is the only thing strand needs from parsing.

#### Option 3: Hybrid — Regex + Tree-Sitter Fallback

Use regex for languages with simple import syntax (Python, Go, Java). Use tree-sitter for complex ones (Rust).

**Pros:**
- Best parsing quality where it matters.

**Cons:**
- Two code paths = two sets of bugs. Testing matrix explodes.
- Still requires tree-sitter as a native dep for the fallback path.
- Rust's import system is complex but regex can handle 90% of cases (`use crate::`, `mod`, `pub use`).

#### Option 4: LSP Integration

Leverage running language servers for import resolution.

**Pros:**
- Perfect accuracy — uses the same resolver the IDE uses.

**Cons:**
- Requires the user to have a running LSP for each language. strand's value is zero-config: `npx strnd` in any repo.
- LSP startup is slow (seconds to minutes for large projects). strand scans in 2-3 seconds.
- Fundamentally incompatible with strand's design as a fast, offline, zero-dependency tool.

### Recommended Approach: Option 1 (Language-Specific Scanner Modules)

**Rationale:**

1. **strand already proved regex works for TS/JS.** The current scanner uses simple regex for `import/require/export` and handles real-world codebases (cal.com: 7,444 files, 906K lines) in 2.6 seconds with correct results. The same approach works for Python, Go, and Java, whose import syntax is simpler than TS/JS.

2. **Zero native dependencies is a hard constraint.** The project explicitly removed tree-sitter to fix `npx strnd` install failures. Re-adding it (Option 2/3) reverses a deliberate decision. Option 4 violates zero-config.

3. **90% accuracy beats 100% accuracy at 10x install cost.** Regex misses edge cases (dynamic imports, metaprogramming). But strand's value is structural overview — blast radius, module topology, hotspots. Missing a few dynamic imports doesn't change the structural picture.

4. **Plugin architecture enables community contributions.** Each plugin is a self-contained file with a clear interface. Adding a new language is a single PR.

### Priority Languages

| Priority | Language | Rationale | Import complexity |
|----------|----------|-----------|-------------------|
| 1 | **Python** | Largest non-JS developer population. `import X` / `from X import Y` is trivially regex-parseable. Django/Flask framework detection. | Low |
| 2 | **Go** | Growing rapidly. `import "path"` / `import ("path1" "path2")` is simple. No path aliases (go.mod handles module paths). | Low |
| 3 | **Rust** | Fastest-growing systems language. `use crate::X`, `mod X`, `pub use` are regex-feasible but have more edge cases. | Medium |
| 4 | **Java** | Enterprise market. `import com.example.Foo` is simple regex. Spring/Maven framework detection. Large file counts may need perf tuning. | Low |

Python first because it has the largest addressable market and the simplest import syntax.

### Scanner Plugin Architecture

#### File structure

```
src/scanner/
  index.ts              # Orchestrator — dispatches to plugins
  plugin.ts             # LanguagePlugin interface
  plugins/
    typescript.ts       # Current TS/JS logic extracted
    python.ts           # New
    go.ts               # New
    rust.ts             # New
    java.ts             # New
```

#### Scanner changes

1. **Extract current TS/JS logic** into `plugins/typescript.ts` implementing `LanguagePlugin`. This is a refactor of existing functions, not new logic.

2. **Registry pattern.** `index.ts` maintains `Map<string, LanguagePlugin>` keyed by extension. On startup, register all built-in plugins.

3. **`isSourceFile()` becomes dynamic:** check against the union of all registered plugin extensions.

4. **`walkDir()` dispatches:** for each file, look up the plugin by extension, call `plugin.extractImports()` and `plugin.extractExports()`.

5. **`resolveEdges()` dispatches:** use the file's plugin for `resolveImportPath()` and `findNodeByImport()`.

6. **Auto-detection:** `scanCodebase()` detects which languages are present (by scanning file extensions in the first pass) and only loads relevant plugins. This avoids importing Python's framework detection logic for a pure Go project.

#### Import extraction patterns per language

**Python:**
```
import foo                          → "foo"
import foo.bar                      → "foo/bar"
from foo import bar                 → "foo"
from foo.bar import baz             → "foo/bar"
from . import sibling               → "./sibling"
from ..parent import thing          → "../parent"
```

**Go:**
```
import "fmt"                        → "fmt" (stdlib, skip)
import "github.com/user/repo/pkg"   → "pkg" (match against local dirs)
import (
    "fmt"
    "github.com/user/repo/pkg"
)
```

**Rust:**
```
use crate::module::item;            → "src/module"
use super::sibling;                 → "../sibling"
mod child;                          → "./child"
pub use crate::types::Foo;          → "src/types"
```

**Java:**
```
import com.example.service.Foo;     → "com/example/service/Foo"
import com.example.service.*;       → "com/example/service/*"
```

### Implementation Plan (Part A)

| Step | Description | Effort |
|------|-------------|--------|
| A1 | Define `LanguagePlugin` interface in `src/scanner/plugin.ts` | 1h |
| A2 | Extract current TS/JS logic into `src/scanner/plugins/typescript.ts` | 2h |
| A3 | Refactor `index.ts` to use plugin dispatch | 2h |
| A4 | Add tests verifying TS/JS behavior is preserved after refactor | 1h |
| A5 | Implement `python.ts` plugin | 3h |
| A6 | Test Python plugin against a real Python repo | 2h |
| A7 | Implement `go.ts` plugin | 3h |
| A8 | Test Go plugin against a real Go repo | 2h |
| A9 | Implement `rust.ts` plugin + `java.ts` plugin | 4h |
| A10 | Update `classifyFile` to handle language-specific test patterns | 1h |
| A11 | Update `shortenPath()` in encoder to strip all language extensions | 30min |
| A12 | Update `.strand` header to show detected language(s) | 30min |

**Total estimate: ~22 hours**

Steps A1-A4 are a pure refactor with no behavior change — should be done first and shipped independently.

---

## Part B: Freshness & Staleness Detection

### Problem Statement

`.strand` is a point-in-time snapshot. On active codebases, it goes stale within hours. Current pain points:

1. **No way to tell if .strand is outdated.** The header has a `generated` timestamp, but nothing compares it against the current codebase state. Users (and LLMs reading `.strand`) trust stale data silently.

2. **No CI integration.** Teams have no way to enforce `.strand` freshness in pull requests. A PR that changes blast radius topology ships without updating the map.

3. **Intra-session drift** is partially solved (supersession message, freshness carve-out in CLAUDE.md, `[CHECKPOINT]` convention — see `docs/plans/2026-03-02-intra-session-map-freshness-design.md`), but inter-session staleness has no automated detection.

### What Already Exists

| Feature | Status | Location |
|---------|--------|----------|
| `generated` timestamp in `.strand` header | Shipped | `src/encoder/strand-format-encode.ts` line 23 |
| `SUPERSESSION_MESSAGE` after `strnd update` | Shipped | `src/cli/templates.ts` |
| Freshness carve-out in CLAUDE.md section | Shipped | `src/cli/templates.ts` `CLAUDE_MD_SECTION` |
| `strnd status` mtime-based staleness check | Shipped | `src/cli/index.ts` `runStatus()` |
| Git hooks (post-commit, post-merge, post-checkout) | Shipped | `src/cli/hooks.ts` |
| Hook shim (`.strnd/hook.mjs`) | Shipped | `src/cli/shim.ts` |
| Atomic write (tmp + rename) | Shipped | `src/cli/index.ts` `runGenerate()` |

**Gap:** No git commit hash in .strand, no `strand check` command, no CI example, no `--fail-if-stale` flag for CI.

### Design

#### 1. Embed git commit hash in .strand header

Change the header line from:

```
STRAND v3 | project | Typescript | 76 files | 12,629 lines | generated 2026-03-07T05:21:49
```

To:

```
STRAND v3 | project | Typescript | 76 files | 12,629 lines | generated 2026-03-07T05:21:49 | git:f9e429a
```

The `git:SHORT_HASH` suffix is the commit HEAD at generation time. If not in a git repo, omit the suffix.

**Implementation:** In `encodeToStrandFormat()`, accept an optional `gitHash` parameter. In `runGenerate()`, resolve `git rev-parse --short HEAD` and pass it through. This is 5 lines of code.

**Why short hash (7 chars), not full hash:** The hash is for staleness comparison, not cryptographic identity. 7 chars is sufficient and saves tokens. If the hash doesn't match HEAD, the file is stale — the exact commit it was generated from doesn't matter.

#### 2. `strnd check` command

A fast, read-only command that compares `.strand` metadata against current state:

```
$ strnd check
.strand is current (generated 2h ago at commit f9e429a, HEAD is f9e429a)

$ strnd check
⚠ .strand may be stale:
  Generated: 2026-03-07T05:21:49 (commit f9e429a)
  Current HEAD: abc1234 (3 commits ahead)
  Changed files since generation: 12
  Run 'strnd update' to refresh.

$ strnd check --fail-if-stale
⚠ .strand is stale (3 commits behind HEAD)
exit code 1
```

**Logic:**
1. Parse the `git:HASH` from `.strand` header line.
2. Run `git rev-parse --short HEAD` to get current HEAD.
3. If hashes match, report current and exit 0.
4. If hashes differ, count commits between with `git rev-list --count HASH..HEAD`.
5. Optionally count changed files with `git diff --name-only HASH..HEAD | wc -l`.
6. With `--fail-if-stale`, exit 1 if stale. This is the CI integration point.

**Fallback:** If `.strand` has no `git:` suffix (pre-upgrade files), fall back to mtime comparison (which `strnd status` already does).

#### 3. CI Integration Examples

**GitHub Actions (`.github/workflows/strand-check.yml`):**

```yaml
name: Check .strand freshness
on: [pull_request]
jobs:
  strand-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx strnd check --fail-if-stale
```

This blocks PRs that have structural changes without regenerating `.strand`. Cost: ~5 seconds (parse header + git compare), no scan needed.

**Pre-commit hook (`.pre-commit-config.yaml`):**

```yaml
repos:
  - repo: local
    hooks:
      - id: strand-freshness
        name: Check .strand freshness
        entry: npx strnd check --fail-if-stale
        language: system
        pass_filenames: false
```

Note: strand already installs a **post-commit** hook that regenerates `.strand` after every commit. The pre-commit hook is an alternative for teams that want to block commits with stale `.strand` rather than auto-regenerate after.

#### 4. Auto-Regenerate Options

**Already shipped:**
- `post-commit` hook: regenerates `.strand` after every commit (via `.strnd/hook.mjs`).
- `post-merge` hook: regenerates after `git merge` / `git pull`.
- `post-checkout` hook: regenerates after branch switch.

**Not yet shipped (future candidates):**

- **`strnd watch`**: filesystem watcher that regenerates on source file changes. Useful for dev servers. Implementation: `fs.watch()` with 2-second debounce. Low priority — the git hooks cover the main use case.

- **Pre-push check**: run `strnd check --fail-if-stale` before push. Could be added to the existing hook infrastructure with a `pre-push` trampoline. Medium priority — useful for teams that don't use CI.

#### 5. CLAUDE.md Freshness Carve-Out

Already shipped in `src/cli/templates.ts` `CLAUDE_MD_SECTION`:

```
If .strand has been regenerated during this session, always prefer the
most recently read version. Compare the `generated` timestamp in the
header line to identify which is newest.
```

This handles intra-session staleness (when the LLM has two `.strand` versions in context). The `SUPERSESSION_MESSAGE` function prints a clear signal after `strnd update`:

```
.strand regenerated (2026-03-07T05:21:49) — supersedes any prior .strand in context.
```

No changes needed to this infrastructure. It works correctly today and is covered by tests in `src/cli/__tests__/templates.test.ts`.

### Implementation Plan (Part B)

| Step | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| B1 | Add `getGitHash(rootDir): string \| null` utility | 30min | None |
| B2 | Thread git hash through `encodeToStrandFormat()` into header line | 30min | B1 |
| B3 | Add `parseStrandHeader(content): { timestamp, gitHash, ... }` parser | 1h | None |
| B4 | Implement `strnd check` command with `--fail-if-stale` | 2h | B3 |
| B5 | Add tests for `check` command (current, stale, no-git, legacy header) | 1h | B4 |
| B6 | Add CI example to README and/or `docs/advanced.md` | 30min | B4 |
| B7 | Update `strnd status` to show git hash comparison (reuse B3 parser) | 30min | B3 |

**Total estimate: ~6 hours**

B1-B2 should ship first (they're backward-compatible — old `.strand` files just won't have the `git:` suffix). B3-B5 can ship together as the `strnd check` command.

### Trade-offs

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| Short hash (7 chars) vs full hash | Tiny collision risk in huge repos | Saves tokens. Staleness detection doesn't need cryptographic uniqueness. |
| `strnd check` reads header only (no scan) | Can't detect if _structural_ changes occurred vs. cosmetic ones | Speed matters for CI. A full scan takes 2-3s; header parse takes <10ms. False positives (flagging cosmetic changes as stale) are acceptable — regenerating is cheap. |
| Git hooks auto-regenerate vs. pre-commit block | Auto-regen adds ~3s to every commit | Already shipped and working. Teams that prefer blocking can use `strnd check --fail-if-stale` in pre-commit instead. |
| No `strnd watch` in initial scope | Users must manually run `strnd update` during development | Git hooks handle the commit boundary. Intra-session freshness is handled by `[CHECKPOINT]` convention. `watch` is a nice-to-have for dev servers, not a blocker. |

### Cost

- **Part B adds zero runtime dependencies.** All git operations use `execSync` (already used by `churn.ts`).
- **Token cost in `.strand`:** the `git:f9e429a` suffix adds ~4 tokens to the header line. Negligible.
- **CI cost:** `strnd check` runs in <1 second. No scan, no analysis, no network calls.

---

## Sequencing

Part B (freshness) should ship first:
1. It is ~6 hours vs ~22 hours.
2. It is backward-compatible (no breaking changes to `.strand` format).
3. It gives immediate value to existing TS/JS users.
4. It unblocks CI integration, which is a common adoption blocker for teams.

Part A (multi-language) ships after, starting with the plugin refactor (A1-A4) which is a no-behavior-change prerequisite, then Python (A5-A6) as the first new language.
