---
title: "SwiftTUI 0.18.1 fixes collection navigation, input, and rendering"
description: "A coordinated bug-fix release for collection focus, state ownership, terminal input, image rendering, and host protocols."
published: 2026-10-17
kind: Release
---

SwiftTUI 0.18.1 brings the recent framework bug fixes to all nine coordinated packages.

Lists recover focus when measured row heights change, multiline table rows retain their geometry, and direct outline lists support native row focus. Thanks to [@echoz](https://github.com/echoz) for these collection fixes in [#57](https://github.com/SwiftTUI/swift-tui/pull/57).

The release also preserves precise scroll positions and final-row navigation, keeps state and bindings attached to their owners, and reconciles presentation and accessibility focus. Terminal readers share incremental decoding behavior across native, WASI, and Windows hosts, preserve input through probes and handoffs, and protect secure drafts and clipboard access.

Rendering fixes cover text and glyph boundaries, paths, colors, image sampling, GIF disposal, JPEG orientation, and clipped paint damage. Host corrections improve wire validation, disconnected recovery, custom browser bundle paths, and empty scene manifests in the SwiftUI host.

See the [framework release notes](https://github.com/SwiftTUI/swift-tui/releases/tag/0.18.1) and [changelog](https://github.com/SwiftTUI/swift-tui/blob/0.18.1/CHANGELOG.md#0181---2026-10-17) for the full changes.
