---
title: "SwiftTUI 0.17 adds a terminal reader and faster clipped text"
description: "Sequential terminal access, chart and terminal-pane review, and community fixes for text rendering, scrolling, and shutdown."
published: 2026-10-12
kind: Release
---

SwiftTUI 0.17 adds a sequential terminal reader and reduces the work spent painting clipped text. Chart data and embedded terminal output gain semantic review controls, while scrolling and cooperative shutdown fixes keep final rows and final input reachable.

## Read and operate terminal apps

Launch an ordinary terminal app with `--reader` or `SWIFTTUI_READER=1`, or press F12 to switch between the grid and reader. Read and search semantic content, select a scene, invoke actions, and edit text through the same application state used by the browser companion. The reader emits text into normal terminal scrollback; speech remains the responsibility of your terminal and screen reader.

SwiftTUICharts exposes exact source values, search, remembered-point comparisons, and authored units. Color-independent presentations name series and thresholds. SwiftTUITerminalView supports frozen output review, scrollback navigation, copy, and a semantic line editor while the child continues running. Each package documents its supported behavior and host qualification limits.

## Welcome our new contributors

Thanks to [@vmarcella](https://github.com/vmarcella) (Vincenzo Marcella) for [#44](https://github.com/SwiftTUI/swift-tui/pull/44), which skips offscreen text lines and avoids resolving styles for glyphs that cannot be painted. Ordinary, rich, preformatted, and styled preformatted text all benefit. A follow-up preserves the right clipping boundary for wrapped text.

Thanks to [@echoz](https://github.com/echoz) (Jeremy Foo) for two contributions in this release. [#46](https://github.com/SwiftTUI/swift-tui/pull/46) preserves collection-owned scroll offsets on axes that do not need focus-reveal movement, keeping the last rows of compact lists reachable. The cooperative-exit work in [#45](https://github.com/SwiftTUI/swift-tui/pull/45) supplied the foundation for landed [#48](https://github.com/SwiftTUI/swift-tui/pull/48): **#48 is derived from #45**, including its policy design, drain wiring, and regression coverage. Quit and EOF now finish after required presentations and synchronous UI follow-ups without draining unrelated producer work to the acquisition cap.

This release also fixes ordinary scroll-view reveal after viewport growth, transformed path origins, terminal clicks after companion zoom, popover-tip names, unchanged accessibility Picker selections, and environment port validation.

See the [framework release notes](https://github.com/SwiftTUI/swift-tui/releases/tag/0.17.0) and [changelog](https://github.com/SwiftTUI/swift-tui/blob/0.17.0/CHANGELOG.md#0170---2026-10-12) for the full changes. All nine coordinated packages move to 0.17.0.
