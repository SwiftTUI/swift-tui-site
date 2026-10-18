---
title: "SwiftTUI 0.18.3 fixes spinner lifecycle cancellation"
description: "Spinner tasks now cancel reliably when reduced motion is enabled after independent list updates."
published: 2026-10-18T01:32:37+00:00
kind: Release
---

SwiftTUI 0.18.3 fixes spinner task cancellation in lists whose rows update independently. Enabling reduced motion now cancels every spinner task, including rows that have not ticked in the latest frame. This also prevents state-owner warnings when progress indicators are hidden and recreated in browser apps.

All nine coordinated packages move to 0.18.3. The release includes the collection navigation, terminal input, state ownership, rendering, Windows image-loading, and host fixes described in the [0.18.2 announcement](/updates/swifttui-0-18-2/).

See the [framework release notes](https://github.com/SwiftTUI/swift-tui/releases/tag/0.18.3) and [changelog](https://github.com/SwiftTUI/swift-tui/blob/0.18.3/CHANGELOG.md#0183---2026-10-17) for the details.
