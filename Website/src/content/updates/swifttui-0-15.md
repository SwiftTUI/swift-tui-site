---
title: "SwiftTUI 0.15 keeps up with the clock"
description: "Animation and input stay responsive under heavy rendering, with semantic accessibility actions across hosts."
published: 2026-09-25
kind: Release
---

SwiftTUI 0.15 focuses on what happens when an app has more to draw than the host can show. Animations now advance to the time a frame is actually consumed. If rendering falls behind, the app skips missed visual samples instead of replaying them; a finite animation can still finish on time.

The run loop also gives input a turn after skipped frames and can pull queued browser input directly. In the counter demo’s 100-click burst at 1440 × 1000, recovery fell from 9.6 seconds to 0.1 seconds without changing the app. Radial gradients do less work outside their visible support, too.

## Accessibility across hosts

Hosts can now send semantic actions for focus, activation, numeric adjustment, and typed control values. The runtime checks that each target still belongs to the live scene and is available for interaction. Android and browser hosts carry these actions through their respective input paths.

## Also in this release

The experimental DOM presenter now includes its fonts and geometry host, honors reduced motion, and rejects pointer input based on stale geometry. The release also fixes input, layout, animation, and runtime issues, including shifted characters in text fields and pending terminal input at end of file.

The 0.15.1 patch caps `swift-collections` below 1.7.0 to avoid a load failure on macOS 26 and iOS 26 with the Swift 6.4 toolchain. It makes no framework source changes.

Read the [full 0.15.0 changelog](https://github.com/SwiftTUI/swift-tui/blob/0.15.0/CHANGELOG.md#0150---2026-09-25) and [0.15.1 patch notes](https://github.com/SwiftTUI/swift-tui/blob/0.15.1/CHANGELOG.md#0151---2026-09-25) for the complete changes.
