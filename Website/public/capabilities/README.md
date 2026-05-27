# Capability strip captures

These six assets back the `WhySwiftTUI` capability strip (under card #04).
Each one currently ships as a placeholder SVG and is referenced from the
component's data table with `ext: "svg"`. To swap in a real capture:

1. Replace the file at the same slug, e.g. drop a PNG at
   `truecolor.png`, then change that row's `ext` to `"png"` in
   `Website/src/components/WhySwiftTUI.astro`.
2. Update the `alt` to describe the captured terminal/emulator if it differs
   from the placeholder's description.
3. Delete the corresponding `.svg` placeholder.

Recommended targets (per `docs/plans/2026-05-27-002-marketing-improvements-plan.md` Task 2.3):

| Slug | Source program | Terminal |
| --- | --- | --- |
| `truecolor` | `gallery` AnimationsTab ramp | any 24-bit-color terminal |
| `osc8` | OSC 8 fixture in gallery | any OSC 8-aware terminal |
| `kitty` | `gallery` ImagesTab | Kitty or WezTerm |
| `sixel` | `gallery` ImagesTab | `xterm -ti vt340` or mlterm |
| `png` | `gallery` ImagesTab static PNG | any terminal |
| `gif` | `gifcat <file>.gif` mid-frame | any terminal |

Aspect ratio in CSS is `2 / 1`. Captures at ~800×400 (or any 2:1) look best.
