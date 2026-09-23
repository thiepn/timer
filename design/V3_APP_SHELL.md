# Timer Visual V3 — App Shell, Navigation & Spatial Architecture

Phase V3 redesigns the product chrome while preserving the internal composition of Home, Live Timer, Library, Workspace, History and Settings for their dedicated phases.

## Implemented

### SVG icon foundation
- Offline same-origin `icons.svg` sprite.
- Consistent 24 × 24 line icon language.
- Timer, Library, History, Settings, Add, Install and Close shell icons.
- Decorative SVGs remain hidden from assistive technology while their controls retain accessible names.

### Contextual top chrome
- Floating M3 top bar instead of a full-width utility header.
- Route-aware context label and title.
- Scroll-reactive material depth.
- Dedicated create/install control cluster.
- Builder context updates when entering timer/reusable-block editors.

### Mobile navigation dock
- Compact floating bottom dock.
- Quiet inactive destinations.
- Accent/state-aware active destination.
- SVG iconography replaces Unicode shell symbols.

### Desktop spatial architecture
- Persistent floating navigation rail from 1100 px upward.
- Brand, destinations and New Timer control share one contained control layer.
- Bottom dock disappears at desktop widths.
- Main content shifts into the remaining workspace instead of simply stretching the phone layout.
- Wider content bounds are available for Workspace, Library and History.

### Sheets and overlays
- M4 modal material strengthened with a bounded blurred backdrop.
- Inset phone sheets instead of edge-to-edge generic panels.
- Centered wide-screen modal geometry.
- Sticky sheet heading and SVG close control.

### Route transitions
- Progressive View Transition API support for route changes.
- Main content owns a named transition surface.
- Reduced-motion setting and `prefers-reduced-motion` disable spatial animation.
- Timing/runtime state remains entirely independent of transition animation.

### Live timing isolation
- Desktop rail, top chrome and mobile dock are removed in live timing mode.
- Live mode always returns to an edge-to-edge stage regardless of desktop shell layout.

## Scope boundary

V3 does **not** redesign:
- Quick Timer hero
- active timer cards
- Live Timer temporal instrument
- Saved Timer objects
- queue timeline
- History visualizations

Those remain V4–V8 work.

## Next

V4 — Home 3.0: Signature Timer Surface.

## Performance budget

V3 adds a persistent responsive shell plus offline SVG sprite. The release budget therefore advances from V2's 134/135 KiB thresholds to **138 KiB soft / 140 KiB hard**. The measured pre-budget V3 shell was 137.2 KiB gzip. Further visual phases must account for additional shell growth explicitly rather than silently bypassing these gates.
