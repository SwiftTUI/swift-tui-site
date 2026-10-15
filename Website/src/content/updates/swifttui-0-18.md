---
title: "SwiftTUI 0.18 improves collection scrolling and browser packaging"
description: "Measured row geometry, composed layout fixes, and explicit Canvas or experimental DOM browser bundles."
published: 2026-10-14
kind: Release
---

SwiftTUI 0.18 improves navigation through variable-height lists and tables, preserves authored layouts, and lets applications choose the browser companion they package.

## Keep collection geometry stable

Lists, tables, and lazy stacks now share sparse measured row geometry. Measurements survive worker snapshots, so moving upward through rows of different heights keeps selection, focus, and visible content aligned. The release also fixes final-row and footer navigation, multi-selection painting, and repeated scroll-target refinement.

## Choose a browser bundle

The built-in terminal companion now ships Canvas and its semantic sidecar. Experimental DOM remains available through an app-owned bundle: `swifttui-web build:web --renderer dom` builds a companion without compiling Swift or WASM, and the host accepts its directory through browser-bundle configuration. DOM bundles include Ioskeley Mono fonts and their license. The built-in Canvas companion no longer switches to DOM through a URL parameter.

## Layout and terminal corrections

Custom disclosure styles preserve the layout of their authored content, Spacer minima no longer grow to match an allocated size, and custom layouts retain scroll viewport ownership. Terminal probes cooperate with reader mode, link helpers detach their standard descriptors, and shutdown honors termination requests raised during the final flush.

Thanks to [@echoz](https://github.com/echoz) for the disclosure-layout contribution in [#49](https://github.com/SwiftTUI/swift-tui/pull/49), and [@vmarcella](https://github.com/vmarcella) for the text-clipping benchmarks and line-visit counter in [#52](https://github.com/SwiftTUI/swift-tui/pull/52).

See the [framework release notes](https://github.com/SwiftTUI/swift-tui/releases/tag/0.18.0) and [changelog](https://github.com/SwiftTUI/swift-tui/blob/0.18.0/CHANGELOG.md#0180---2026-10-14) for the full changes. All nine coordinated packages move to 0.18.0.
