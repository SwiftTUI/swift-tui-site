---
title: "SwiftTUI 0.16 connects terminal and browser scenes"
description: "A shared browser companion, richer accessibility semantics, and fixes across input, rendering, navigation, and shutdown."
published: 2026-10-08
kind: Release
---

SwiftTUI 0.16 gives interactive terminal sessions a browser companion that shares their live scenes. Terminal launches start the companion by default on macOS, Linux, and Windows; set `SWIFTTUI_COMPANION=off` to opt out. Scene selection and pointer input follow the viewport the host presents.

## More content participates in accessibility

Ordinary text, authored paragraphs, progress indicators, Picker options, collections, and navigation containers now carry richer semantics. Applications can supply custom assistive actions, bind accessibility focus independently of keyboard focus, and name regions for navigation. Browser editors preserve native selection and composition while Swift frames arrive, and hosts carry live accessibility preferences back to the runtime.

Use matching framework and browser 0.16.0 packages for the new transport. The DOM renderer remains experimental, and automated coverage does not expand the documented screen-reader acceptance beyond the recorded journeys.

## Input and lifecycle fixes

This release bounds terminal input recovery, WebHost ingress, PTY writes, and shutdown ownership. It fixes scroll momentum scheduling, progress text, menu Picker dismissal, navigation binding identity, path bounds, and layout and animation regressions. Spawned link helpers are reaped without blocking the caller, and an empty `NO_COLOR` variable no longer disables color.

The dependency floor moves to `swift-collections` 1.7.2. This lifts the temporary cap from 0.15.1 after upstream fixed the Swift 6.4 runtime-symbol issue on older Apple operating systems.

Host integrations that switch exhaustively over accessibility action enums need to handle the new cases. See the [framework changelog](https://github.com/SwiftTUI/swift-tui/blob/0.16.0/CHANGELOG.md#0160---2026-10-08) and [browser changelog](https://github.com/SwiftTUI/swift-tui-web/blob/0.16.0/CHANGELOG.md#0160---2026-10-08) for the full changes and integration notes.
