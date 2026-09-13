# Scroll surfaces

The root layout mounts `PageScrollbar`. It loads OverlayScrollbars once and
enhances explicitly marked `data-yeye-scroll` surfaces, including portals and
content mounted after navigation. Use `x`, `y`, or `both` to select axes;
`auto` reads the existing CSS overflow direction. Keep dimensions, flex/grid
layout, refs and scroll handlers on the existing element.

`ScrollArea` retains its root, viewport classes and viewport props, and accepts
`direction="x" | "y" | "both"` (default `y`). Its viewport is the actual
scrolling node on both desktop and touch devices. Avoid putting library-created
decoration directly inside `ul`, `ol`, `pre` or table structure; put the
scroll surface around those semantic elements instead.

The shared options use the existing `os-theme-yeye`: an 8px transparent track,
4px rounded gray handle, 36px minimum handle length, drag enabled, track click
disabled, and hide 600ms after leaving. Coarse-pointer devices and narrow touch
viewports keep native scrolling. Module failure leaves native scrolling intact.
Instances are destroyed when their surface is removed or disabled. The
`yeye-scrollbar-ready` event lets initial programmatic positioning resume after
the library's asynchronous measurement (used by the help step navigator).

## Inventory

| Area | Shared entry point / explicit surfaces |
| --- | --- |
| Public pages and admin pages | Root `PageScrollbar` |
| Setup, manual scheduling picker, upgrade simulation, release preview | `ScrollArea` |
| Account dialogs, consent, mastery picker, Skland dialogs | `DialogContent` / `DialogBody`, enhanced only when their CSS enables scrolling |
| Schedule details | `Drawer` body and `PlanResultSummary` detail sections |
| Sidebar | `SidebarContent`; disabled in collapsed desktop mode |
| Dropdown options | `ComboboxList`, retaining Base UI list semantics, refs and keyboard behavior |
| Shift / rarity tabs | `TabsList`, only when overflowing CSS is enabled |
| Operator filtering | `ManualOperboxPicker`, `SkillFilterRow`, `MasteryTargetPicker` |
| Skland status | Overview filters and horizontal status content |
| Help | `HelpFloatingNav` popup and `ImportGuidePager` step navigation |
| Admin navigation / issue filters | `admin-nav` and `issues-client` |
| Admin diagnostics | Diagnostic table and recent events |
| Admin skill annotations | Matching operator listbox |
| Admin quality | Import preview, drafts, batches, input comparisons and execution JSON |
| Text entry | Native textarea editing and scrolling, with matching CSS |
| Native select menus | Browser / operating-system controlled popup |

Numeric sliders and wheel behavior are unchanged. Existing smooth scrolling is
not extended to other surfaces.

## Regression coverage

`e2e/scrollbars.spec.ts` covers axes and dragging, hover visibility, track clicks,
resize/content changes, teardown, nested dialog/dropdown navigation, background
locking, failed module loading, dark/reduced-motion styling, textarea editing,
and phone/tablet touch contexts. Existing help, manual scheduling, operator
filtering and mastery tests cover real navigation, incremental lists and refs.
Authenticated admin coverage runs with the isolated database in CI.
