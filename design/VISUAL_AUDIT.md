# Timer — Visual Audit
## Phase V1 · Baseline Audit

**Product baseline:** Timer v2.5  
**Audit scope:** Home, live timer, Multi-Timer Workspace, queues, Saved Timers, builders, sheets, history, settings, navigation, responsive behavior, themes and accessibility states.

This audit intentionally does **not** redesign individual screens. It identifies the visual-system problems that V2–V10 must solve.

---

## 1. Executive diagnosis

Timer is functionally advanced but visually reads as a capable utility/prototype.

The dominant visual pattern is repeated across almost every surface:

- dark neutral background
- dark elevated rectangle
- 1 px border
- 10–24 px radius
- single broad shadow
- blue accent
- white title + gray metadata
- Unicode/symbol icon
- standard rectangular button

This creates consistency, but too much consistency: important objects, secondary metadata, navigation, automation, destructive actions and live timing surfaces are all built from nearly the same ingredients.

The result is **visual flattening**. The product contains a sophisticated timer engine, queue automation, saved presets, recovery, analytics and multi-runtime controls, but the interface does not visibly communicate that sophistication.

### Primary visual gap

> The product lacks a signature visual object and a meaningful hierarchy of materials.

The redesign should therefore focus on **identity, hierarchy, temporal visualization and state expression**, not decoration.

---

## 2. Existing strengths to preserve

### 2.1 Legibility
Large timer numerals are easy to scan. Tabular numerals are already used in key timing surfaces.

### 2.2 Functional density
The UI accommodates a large feature set without excessive navigation depth.

### 2.3 Dark / Light / OLED support
Theme foundations exist and should be evolved rather than replaced.

### 2.4 Accessibility foundations
The app already supports:
- browser zoom
- reduced motion
- forced colors
- high contrast
- large controls/text
- keyboard navigation
- focus-visible states
- screen-reader semantics

The redesign must preserve these as hard constraints.

### 2.5 Responsive structure
The layout already collapses reasonably across phone/tablet/desktop widths. V2–V10 should improve composition rather than rewrite responsive architecture unnecessarily.

### 2.6 State-driven phase colors
Work/rest/prepare/recovery already have semantic color concepts. These should become more structurally important.

---

## 3. Global visual problems

### A. Surface hierarchy is too shallow

Current tokens effectively provide:
- background
- surface
- surface 2
- surface 3
- one border
- one shadow

Most components still converge to the same visual result.

**Impact:** navigation, content, interactive controls, active runtime cards and modal surfaces compete at similar visual depth.

**Required redesign:** named materials with explicit roles:
- canvas
- content
- raised content
- interactive surface
- floating controls
- navigation glass
- modal/sheet
- live stage

---

### B. Cards are overused as the default container

Home shortcuts, active timers, library objects, workspace timers, queue presets, analytics metrics and settings all rely heavily on bordered rounded rectangles.

**Impact:** no feature feels special; complex automation looks like form data.

**Required redesign:** use containment only when it adds grouping. Prefer typography, alignment, spatial lanes, tracks and tonal separation where boxes are unnecessary.

---

### C. Typography hierarchy is underdeveloped

The product has large timer numbers, but otherwise relies primarily on size + weight changes inside the same system font stack.

**Impact:** screen titles, timer object names, labels, metadata and data read too similarly.

**Required redesign:** define explicit roles:
1. Display numerals
2. Hero/title
3. UI/control
4. Body
5. Metadata/data labels

Timer numerals require a specialized visual treatment independent of ordinary UI type.

---

### D. Iconography feels provisional

Current interface frequently uses characters such as:
- ◷
- ↔
- ◆
- ...
- ＋
- ★
- ×
- arrows

These are functional but inconsistent in stroke, optical size and platform rendering.

**Impact:** the interface reads like a web prototype instead of a designed app.

**Required redesign:** one coherent SVG icon language with standardized:
- 20 / 24 px viewboxes
- stroke weight
- corner style
- filled/active variants only where meaningful
- optical centering

Emoji must never be used for core interface icons.

---

### E. Color is mostly decorative

Accent color currently changes emphasis, while phase color mostly colors text/progress.

**Impact:** timer identity and state are weakly expressed.

**Required redesign:** color should communicate:
- timer identity
- active phase
- queue ownership
- focus
- paused state
- overtime
- destructive state
- warnings
- completion

Inactive UI should remain low-chroma.

---

### F. Motion is state replacement rather than spatial continuity

The application updates reliably, but transitions generally appear as immediate DOM changes.

**Impact:** the UI feels static despite being a real-time temporal product.

**Required redesign:** motion must explain:
- timer start
- pause/resume
- phase transition
- queue advance
- card reordering
- sheet presentation
- selection
- completion
- navigation changes

Motion should be sparse and causal, never ornamental.

---

### G. The product has no signature visual language

The existing brand mark and UI do not create an immediately recognizable screenshot.

**Required redesign direction:**

> **Precision instrument + ambient depth + expressive state.**

Timer should feel like a precision instrument when active and a calm control surface when idle.

---

## 4. Screen-level audit

### 4.1 Home

Current strengths:
- Quick Timer is prominent.
- Recent/pinned timers are efficient.
- active timer visibility is good.

Problems:
- Quick Timer still reads as a large input inside a card.
- the page does not have a visually dominant object
- pinned/recent controls look generic
- shortcuts and active timers use similar card grammar
- the visual identity is not obvious from a screenshot

V4 target:
- signature timer instrument/dial
- stronger hero composition
- ambient accent field
- pinned durations integrated around/under the hero
- less rectangular containment

---

### 4.2 Live Timer

Current strengths:
- excellent numeral scale
- phase label and progress are clear
- dedicated fullscreen layout exists

Problems:
- visual center is still primarily text
- progress is a generic linear bar
- timer state changes do not materially transform the stage
- controls are large rectangles rather than a cohesive control object
- overtime mainly changes text semantics rather than the instrument itself

V5 target:
- circular/squircle temporal visualization
- phase-aware live stage
- threshold/next-phase expression
- floating control capsule
- distinct stopwatch/countdown/interval visual languages
- stronger wall mode

---

### 4.3 Saved Timers

Current strengths:
- metadata model is rich
- accent/icon support exists
- filtering/organization is strong

Problems:
- objects still resemble generic rows
- timer type is mostly textual
- accent appears as a thin border/icon tone
- no visual preview of a timer's temporal structure

V6 target:
- timer objects become visually identifiable
- micro-previews for countdowns/intervals/sequences
- visual density modes for mobile vs wide screens
- stronger collection hierarchy without giant colored blocks

---

### 4.4 Multi-Timer Workspace

Current strengths:
- powerful live controls
- multiple layouts
- grouping and colors
- queue integration

Problems:
- cards are structurally similar to other cards
- running vs paused vs overtime has insufficient visual differentiation
- grouping is mostly headings + cards
- focus mode scales cards but does not become a true focused composition

V7 target:
- spatial lanes
- active edges / phase motion
- ghosted queued state
- visually elevated focused timer
- clear state materials rather than only labels

---

### 4.5 Queues

Current strengths:
- functional queue model is strong
- current/queued/completed states exist
- drag ordering works

Problems:
- temporal flow is represented as list rows
- connectors/topology are missing
- step automation is represented mainly by text/select controls
- queued timers do not feel like future points in a timeline

V7 target:
- vertical timeline on mobile
- horizontal flow on wide screens
- animated connector path
- compact action glyphs for advance/repeat/overtime/stop
- spatial drag feedback

---

### 4.6 Builders / Sheets

Current strengths:
- dense editing features fit in a constrained UI
- sheets are reusable and keyboard-safe

Problems:
- many controls have equal visual weight
- settings/forms resemble browser UI
- primary vs advanced controls are not separated strongly enough
- sheet material is similar to normal content cards

V2/V3 target:
- stronger field hierarchy
- floating/modal material distinct from content
- section grouping through spacing and typography before borders
- better control/icon system

---

### 4.7 History / Analytics

Current strengths:
- substantial data exists
- session detail contains real semantics

Problems:
- data presentation does not visually reveal the richness
- metrics appear as generic cards
- chronology is under-visualized
- phase progression is not shown as a temporal story

V8 target:
- event/session timeline
- phase strips
- stronger headline metrics
- selective charts
- richer session narrative

---

## 5. Current visual anti-patterns to eliminate

The redesign must actively remove these patterns:

1. **Every concept in a bordered card**
2. **Every card with the same shadow**
3. **Every interaction using the same rectangular button**
4. **Unicode glyphs as permanent interface iconography**
5. **Accent color used only as blue text/background**
6. **Decorative blur without material hierarchy**
7. **Large numbers without an accompanying visual instrument**
8. **Lists used to represent temporal flows**
9. **Secondary controls competing with primary content**
10. **Animation added solely to make the UI feel “modern”**
11. **Gradient-heavy neon/gaming styling**
12. **Glass applied to content surfaces indiscriminately**

---

## 6. Visual sophistication criteria

A visual upgrade is successful only if it improves at least one of:

- hierarchy
- state comprehension
- temporal comprehension
- spatial continuity
- object identity
- navigation clarity
- perceived quality
- responsive composition

Pure decoration does not qualify.

---

## 7. Baseline screen priority

### Tier A — flagship
1. Live Timer
2. Home / Quick Timer
3. Multi-Timer Workspace + Active Queue

### Tier B — product depth
4. Saved Timers
5. Queue Builder
6. History / Session Detail

### Tier C — supporting
7. Timer builders
8. Settings
9. Backup / recovery
10. Utility sheets

The design system must be proven on Tier A before polishing Tier C.

---

## 8. Non-negotiable preservation constraints

No visual phase may break:

- timestamp-based timing truth
- multi-runtime independence
- active-session recovery
- queue recovery
- Wake Lock lifecycle
- backup compatibility
- keyboard navigation
- visible focus
- reduced motion
- high contrast
- forced colors
- large controls/text
- light/dark/OLED themes
- mobile safe areas
- browser zoom
- offline PWA operation

Visual work is not permitted to change core timing semantics.

---

## 9. Audit conclusion

The redesign should not start by “making cards prettier.”

The required order is:

1. establish visual contract
2. replace primitive token architecture
3. create meaningful materials
4. establish typography/icon/motion systems
5. build a signature timer instrument
6. propagate the system across product surfaces

That is the contract for V2–V10.
