# Prompt Palette compact popover review

Date: 2026-09-15. Tracking: [#118](https://github.com/NaruForge/Paseo-Plugin/issues/118).
Target: exact `@getpaseo/plugin` **0.8.0**.

## Problem and change

After #117, the picker used the host's popover contribution. In Paseo v0.8.0,
[`MenuSurface`](https://github.com/getpaseo/paseo/blob/v0.8.0/packages/app/src/components/ui/menu/menu-surface.tsx)
uses a content-sized compact sheet with its own `BottomSheetScrollView`.
The picker had no minimum body height, so loading and small libraries produced
short sheets near the bottom. Its nested vertical lists also conflicted with the
[single scroll owner contract](https://paseo.sh/docs/plugins/v0.8/reference#scrolling).

The compact body now reserves `round(windowHeight * 0.6)` points, including
loading, empty and error states. `useWindowDimensions` updates this minimum when
the window changes. This is **not** a fixed sheet height or snap point: Paseo adds
its header/insets, caps the visible sheet and scrolls longer content. Wide bodies
remain content-sized within the host's popover limits.

Both inner ScrollViews and their height caps were removed. Manage/Add prompts
precedes the list. The selected name, Back, Copy text and Send precede the full
preview, so those controls do not follow a potentially 20,000-character body.
They are not sticky: after reading or selecting from a deeply scrolled list,
users may need to scroll back to the controls. The plugin does not control the
host's scroll offset. Preview selection still does not send anything.

## Source UI checks

UI grade **D**. Actual `PromptPickerContent`, `PromptRow`, `Action` and
`createPromptSender` source rendered with React Native Web in Chrome:

| Viewport | Light | Dark |
| --- | --- | --- |
| 390 × 844 compact | Passed | Passed |
| 320 × 568 small compact | Passed | Passed |
| 568 × 320 short landscape | Passed | Passed |
| 1280 × 900 wide | Passed | Passed |

The preview substitutes SDK data and a content-sized host container with one
vertical scroller. Compact presentation is bottom-aligned and capped at viewport
height, with simulated header and bottom clearance. Wide presentation uses a
420-pixel-wide, 440-pixel-max-height review container; it does not reproduce
actual anchor placement. Colors are representative light/dark fixtures.

- On the two portrait sizes, loading, empty, one-item and short-preview states
  kept the same simulated sheet height (less than 2 pixels difference).
- Short landscape content stayed reachable through the host scroller.
- A single row retained a touch target of at least 44 pixels. Keyboard Enter
  selected the preview without sending. Copy and Settings navigation worked.
- All 100 list items and a 400-line body were reachable. No inner vertical
  scroll container or horizontal page overflow was found.
- Pending Send and Back were disabled. Uncertain delivery blocked Send until
  explicit acknowledgement. The Composer draft was preserved.
- Loading failure and Retry worked in all eight layout/theme combinations.
- A separate long-name/20,000-character unbroken-body check found no horizontal
  overflow. Resizing an open compact picker changed the body minimum from 506
  points (844 high) to 192 points (320 high).
- The unavailable Agent path made no send call. A subsequent successful mocked
  send submitted the exact body once and closed the picker.

Local ignored evidence: `artifacts/prompt-mobile/` contains the build/preview,
`verify.js`, `verify-extra.js` and layout/theme screenshots. These browser checks
are separate from CI's unit tests and were run through `playwright-cli`.

## Static checks

- `npm run typecheck --workspace prompt-palette`: passed.
- `npm test --workspace prompt-palette`: 4 files, 19 tests passed.
- `npm run check:docs-sync`: passed.
- `npm run check:git-source-imports`: passed.
- `git diff --check`: passed.

## Runtime limits

This is source UI validation, not an installed-app or native-device capture.
No live Agent message, plugin reload or daemon restart was performed. User
authorization covered source improvement and merge; installation/reload remains
separate under the repository lifecycle rules.

Actual iOS/Android sheet measurement, gestures, safe areas, keyboard interaction,
OS font scaling and screen-reader behavior remain unverified. No layout/theme
combination in the source matrix was omitted. Native presentation requires
checking on the affected mobile client after applying the source update; browser
dimensions do not establish native compatibility.
