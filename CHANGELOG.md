# Changelog

## 0.1.8

- Removed enum index hard cap of 4000 Python files to support larger repositories.
- Stopped excluding generated-folder Python files from enum indexing so generated enums remain discoverable.

## 0.1.7

- Fixed enum hover resolving to unrelated enums by removing global value-only fallback.
- Fixed keyword signature parsing for long parameter lists (up to 300 lines), restoring enum mapping for large Robot keywords.
- Enum hover now follows keyword + argument mapping reliably on continuation lines.

## 0.1.6

- Clean follow-up release to align Marketplace installs on one version baseline.
- Includes hover recovery + enum hover guardrails from 0.1.5 for consistent behavior across machines.

## 0.1.5

- Fixed hover regression where enum hover helpers were missing and could break all extension hover behavior.
- Added enum hover settings back to extension configuration:
  - `robotDocPreview.enableEnumValueHover`
  - `robotDocPreview.enumHoverMaxEnums`
  - `robotDocPreview.enumHoverMaxMembers`
- Added enum hover error guardrails so enum failures no longer block variable/doc hover.

## 0.1.3

- Added variable value hover enrichment for Robot variables (`${...}`, `@{...}`, `&{...}`, `%{...}`).
- Variable hover now shows raw values from local `Set Variable` assignments in the same test/keyword before the cursor.
- Added settings:
  - `robotDocPreview.enableVariableValueHover`
  - `robotDocPreview.variableHoverLineLimit`
- Extended command visibility to `.resource` files.

## 0.1.1

- Polished Marketplace metadata and README publish instructions.
- Added license and packaging ignore configuration.
- Improved Robot documentation rendering behavior for arrow-style (`->` / `=>`) lines.

## 0.1.0

- Initial Marketplace-ready release of Robot Markdown Companion.
- Added read-only side preview for Robot Framework `[Documentation]` blocks.
- Added optional CodeLens and hover preview support.
- Added live sync on active editor, cursor movement, and debounced edits.
- Added visual handling for `->` and `=>` indentation markers.
