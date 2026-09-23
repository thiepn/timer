# Timer — Visual Design Contract
## Phase V1 · Art Direction & Redesign Contract

**Status:** Binding for V2–V10  
**Product:** Timer  
**Art direction:** **Precision instrument + ambient depth + expressive state**

This document is the authority for visual implementation until explicitly revised.

---

# 1. Product visual identity

Timer is not a generic productivity dashboard.

It is a **real-time precision instrument** that expands into a sophisticated automation workspace.

The visual system must communicate two operating modes:

## Idle
Calm, restrained, quiet and organized.

## Active
Focused, temporal, alive and state-aware.

The UI should become visually more expressive as temporal importance increases.

### Identity sentence

> Quiet controls around a highly expressive temporal instrument.

---

# 2. Design principles

## P1 — Time is the hero

When a timer is active, time must dominate the composition.

Secondary metadata, navigation and settings must visually recede.

## P2 — State changes should be visible before they are read

Running, paused, rest, work, overtime, complete, queued and disabled states must be distinguishable through more than text labels.

## P3 — Depth has meaning

Elevation/material changes represent hierarchy:
- background
- content
- interactive object
- floating control
- modal

Do not add shadows/blur simply for decoration.

## P4 — Color is semantic

Color communicates identity or state. Low-priority UI stays neutral.

## P5 — Motion explains causality

Motion should answer:
- where did this come from?
- what changed?
- what will happen next?

## P6 — Restraint creates sophistication

Not everything should glow, float, blur or animate.

## P7 — Precision before personality

Numbers, alignment, progress and timing state must remain exceptionally clear.

## P8 — Accessibility is part of the art direction

Reduced motion, high contrast and large text are alternate designed modes, not fallbacks.

---

# 3. Material hierarchy

V2 must implement named semantic materials.

## M0 — Canvas
Use for:
- global page background
- live stage background
- broad ambient color fields

Properties:
- lowest contrast
- no border
- may carry subtle ambient gradient/noise

## M1 — Content
Use for:
- ordinary grouped information
- list/tile bodies where containment is useful

Properties:
- subtle tonal separation
- little/no shadow
- restrained border

## M2 — Raised interactive
Use for:
- active timer object
- interactive preset tile
- focused workspace item

Properties:
- clearer border/light edge
- shallow elevation
- hover/press response

## M3 — Floating controls
Use for:
- bottom navigation
- live control capsule
- compact floating toolbars

Properties:
- translucent/blurred material allowed
- strong separation from content
- bounded use only

## M4 — Modal
Use for:
- sheets/dialogs
- destructive confirmations
- focused editors

Properties:
- strongest material separation
- distinct backdrop
- never visually confused with M1 cards

## M5 — Live stage
A special material state rather than a normal card.

Properties:
- edge-to-edge where possible
- phase-aware ambient field
- designed around temporal visualization
- no unnecessary card chrome

---

# 4. Surface rules

### Do
- use spacing before borders
- use tonal contrast before heavy shadows
- use one clear floating layer at a time
- let important objects break the normal card rhythm
- reserve blur for control/navigation/modal layers

### Do not
- stack glass on glass
- blur ordinary content tiles
- use identical border/shadow/radius on every object
- place a card inside a card unless the nested hierarchy is semantically necessary
- use giant gradient blobs as decoration

---

# 5. Color contract

The system will use three separate color concepts.

## 5.1 Neutral foundation

Each theme must define:
- canvas
- content
- raised
- floating
- modal
- primary text
- secondary text
- tertiary text
- hairline border
- strong border

Dark must not be pure black except OLED.

Light must not be pure white everywhere.

## 5.2 User accent

The user's chosen accent is for:
- selected controls
- timer identity
- focused object
- navigation selection
- intentional branded emphasis

It is **not** the automatic color for every primary button.

## 5.3 Semantic temporal colors

Required semantic states:

| State | Role |
|---|---|
| Work | energetic positive action |
| Rest | cool recovery |
| Prepare | anticipatory warm |
| Recovery/Cooldown | calm restorative |
| Paused | neutral/desaturated |
| Overtime | urgent but not destructive |
| Warning | approaching threshold |
| Danger | destructive/error only |
| Complete | resolved/success |

Overtime and Danger must be visually distinct.

---

# 6. Ambient color rules

Ambient color may appear as:
- large low-opacity radial field
- restrained edge glow
- live-stage vignette
- subtle focused-card illumination

Maximum principle:

> Ambient color must be felt before it is noticed.

No saturated full-screen gradients in ordinary idle screens.

OLED mode disables expensive/bright ambient layers by default.

---

# 7. Typography contract

V2 must define these semantic roles.

## T0 — Timer Display
Use only for:
- countdown
- stopwatch
- overtime
- large duration readouts

Requirements:
- tabular numerals
- optical alignment
- tight tracking
- colon treated optically
- responsive sizing without wrapping
- visually stable while digits change

## T1 — Hero
Screen-level primary title or object name.

## T2 — Section / object title
Timer names, collection names, queue title, group title.

## T3 — UI
Buttons, navigation, controls.

## T4 — Body
Descriptions and explanatory copy.

## T5 — Metadata
Rounds, phase labels, timestamps, tags, secondary statistics.

Rules:
- hierarchy should rely on type and spacing before borders
- metadata must remain readable, not low-contrast decoration
- all numerical tables/data use tabular figures where appropriate

No external webfont dependency may be required for core operation. If a custom font is later considered, a system fallback must preserve layout.

---

# 8. Shape contract

V2 must introduce a coherent scale.

Recommended semantic scale:

- **R1 8 px** — tiny controls/data chips
- **R2 12 px** — inputs/compact buttons
- **R3 16 px** — ordinary objects
- **R4 22 px** — major panels
- **R5 30 px** — hero/floating materials
- **full** — pills/dials/circular controls

Shape must communicate role.

Do not use 13–16 px rounded rectangles for nearly everything.

---

# 9. Iconography contract

V3 must replace permanent Unicode interface glyphs with one SVG system.

Requirements:
- consistent 24 × 24 coordinate system
- 1.75–2 px optical stroke family
- rounded joins/caps unless symbol meaning requires otherwise
- consistent visual weight
- icons inherit current color
- no network-loaded icon dependency required for offline use
- active variants may use fill selectively

Core icon families required:
- navigation
- play/pause/stop
- timer/stopwatch
- interval/sequence
- queue
- library
- history
- settings
- add/edit/delete
- favorite/pin/archive
- reorder
- overflow
- sound/mute
- fullscreen
- lock
- layout
- repeat
- overtime
- advance

Emoji are prohibited for functional controls.

---

# 10. Temporal visualization contract

Time must become visual, not only numeric.

Every timer type should eventually have a meaningful temporal signature.

## Countdown
- remaining vs elapsed geometry
- threshold marker support
- progress must remain readable with reduced motion

## Interval
- current phase
- next phase
- round context
- work/rest rhythm visible at a glance

## Stopwatch
- open-ended visual language
- laps represented as chronology, not only rows

## Sequence
- current step inside broader structure

## Queue
- current point inside future flow

## Overtime
- visual state transition distinct from normal countdown

The numeric value remains the authoritative visual element. Decorative visualization must never make the remaining time less legible.

---

# 11. Motion contract

## Motion classes

### Micro
80–140 ms
- press
- hover
- toggle
- icon response

### Control
140–220 ms
- chip selection
- button transformation
- local panel reveal

### Spatial
220–340 ms
- sheet presentation
- navigation indicator
- card reordering
- queue movement

### State
280–500 ms
- timer start
- phase transition
- completion
- focused-object transition

Spring behavior may be used for physical UI objects, but never for changing timer digits.

## Motion rules

- timer digits do not bounce
- no perpetual decorative animation while idle
- ambient animation must pause/reduce when page is hidden
- queue connectors may animate only during transitions
- reduced-motion mode replaces spatial transforms with fades/instant state changes
- motion must not delay timer controls

---

# 12. Interaction feedback

Every interactive object should support the applicable states:

- idle
- hover
- pressed
- focused
- selected
- disabled
- loading
- destructive

Press behavior should feel tactile through:
- 1–2 px translation or very small scale change
- local tonal shift
- immediate response

Avoid oversized bouncing/springing buttons.

---

# 13. Navigation contract

Navigation is a control layer, not ordinary content.

V3 target:
- floating bottom dock on phone
- stronger separation from page content
- quiet inactive destinations
- clear moving/transforming active indicator
- optional responsive rail/desktop treatment later
- navigation should visually recede during live timing

Do not make navigation brighter than the content it controls.

---

# 14. Home contract

V4 must make Home visually identifiable in a screenshot.

Required:
- one signature Quick Timer instrument
- one clear primary action
- pinned/recent durations integrated with the hero
- ambient identity color
- shortcuts demoted relative to Quick Timer
- active runtime summary remains visible without competing with hero

Home must no longer feel like a form plus shortcut cards.

---

# 15. Live Timer contract

V5 is the flagship.

Required:
- edge-to-edge live stage
- strong timer display
- progress instrument
- explicit phase identity
- compact floating controls
- next-state preview
- distinct running / paused / overtime / complete visual states
- Wall mode visually minimal

The Live Timer should be the most sophisticated screen in the application.

---

# 16. Saved Timer object contract

V6 should make saved timers identifiable before reading all metadata.

Each object may express:
- timer icon
- accent
- duration
- compact temporal signature
- type
- collection
- pinned/favorite state

Interval/sequence timers should eventually expose micro-visualizations instead of only textual summaries.

---

# 17. Workspace / Queue contract

V7 must represent temporal relationships spatially.

Queue:
- mobile = vertical timeline/track
- wide = horizontal or lane-based flow
- connector between steps
- current state visually anchored
- future steps subdued
- completed steps resolved

Workspace:
- running objects feel active
- paused objects become quiet
- overtime becomes visually urgent
- queued objects appear future/ghosted
- focused timer rises in hierarchy

---

# 18. History contract

V8 turns history into a temporal narrative.

Prefer:
- event/phase timelines
- duration strips
- typographic metrics
- selective charts
- day/week structure

Avoid:
- dashboard of equal metric cards
- charts without decision/information value

---

# 19. Theme contract

Required production themes:

## Dark
Default premium dark neutral.

## Light
Warm/cool neutral balance with real surface depth—not simply inverted Dark.

## OLED
True black canvas, reduced glow, fewer blurred surfaces, energy-conscious.

Each theme must preserve semantic phase identity.

Optional named palettes may be added later, but theme proliferation is not part of V1–V3.

---

# 20. Accessibility contract

The visual redesign must preserve or improve:

- WCAG-compatible contrast
- visible keyboard focus
- 44 px minimum primary touch targets where applicable
- browser zoom
- high contrast mode
- forced colors
- reduced motion
- text scaling
- screen-reader semantics
- logical DOM order despite visual reordering

Color alone may not communicate a critical state.

---

# 21. Performance contract

Visual sophistication may not compromise timer reliability.

Rules:
- timing truth remains timestamp-based
- CSS/animation is never the time source
- animation work should stop/reduce when hidden
- no continuous expensive backdrop effects across the full page
- OLED mode minimizes luminous/blurred layers
- large active timer counts may automatically reduce ambient effects
- motion cannot block input
- visual phases must remain inside the repository's performance/release gates

---

# 22. Responsive contract

Primary QA widths:

- 320
- 360
- 390
- 430
- 768
- 1024
- 1280
- 1440+

Required orientations:
- phone portrait
- phone landscape
- tablet portrait
- tablet landscape
- desktop narrow
- desktop wide
- fullscreen live mode

No desktop design may simply stretch phone cards across empty space.

---

# 23. State matrix

Every redesigned primary object must be reviewed in:

- idle
- hover
- focus
- pressed
- selected
- running
- paused
- overtime
- complete
- queued
- disabled
- error
- empty
- archived

Not every object implements every state, but no applicable state may be visually undefined.

---

# 24. Anti-style list

The following are explicitly rejected:

- neon cyberpunk aesthetic
- gratuitous purple/blue gradients
- glassmorphism on every card
- giant glow halos around ordinary buttons
- excessive pill controls
- generic SaaS dashboard appearance
- fake 3D controls
- skeuomorphic stopwatch imitation
- constant particle/noise animation
- confetti completion
- oversized icon tiles everywhere
- aesthetic effects that reduce timer readability
- “AI app” visual clichés: glowing borders, dense gradients, floating glass cards with no hierarchy

---

# 25. Visual acceptance test

A redesigned screen passes only when:

1. Primary task is identifiable within one second.
2. Running/paused/overtime state can be identified without reading a status sentence.
3. Secondary controls visually recede.
4. There is no unnecessary container around content that can stand through alignment/spacing.
5. Typography alone establishes at least two levels of hierarchy.
6. Accent color has semantic purpose.
7. Motion, if present, explains a transition.
8. Reduced-motion version remains coherent.
9. Light/Dark/OLED each appear intentionally designed.
10. The screen still works at 320 px width and large text.
11. Core controls remain immediately accessible.
12. The design looks like one product rather than a collection of redesigned screens.

---

# 26. V2 implementation gate

Phase V2 may begin only with these decisions locked:

- Art direction: **Precision instrument + ambient depth + expressive state**
- Material hierarchy: M0–M5
- Type hierarchy: T0–T5
- semantic temporal color architecture
- radius/shape scale
- iconography direction
- motion classes
- accessibility/performance constraints
- anti-style list

V2 should implement these as real reusable tokens/primitives before redesigning Home or Live Timer.
