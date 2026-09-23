# Timer Visual Overhaul

The visual redesign is governed by the Phase V1 contract.

## Authority order

1. [Visual Design Contract](./VISUAL_DESIGN_CONTRACT.md) — binding visual rules for V2–V10.
2. [Visual Audit](./VISUAL_AUDIT.md) — baseline problems and screen priorities.
3. [Visual QA Matrix](./VISUAL_QA_MATRIX.md) — verification matrix for every implementation phase.

## Art direction

> **Precision instrument + ambient depth + expressive state**

Timer should be visually quiet while idle and increasingly expressive as temporal importance rises.

## Implementation roadmap

- **V1 — Visual Audit, Art Direction & Redesign Contract** — complete
- **V2 — Design System V3: Color, Type, Geometry & Materials** — complete
- **V3 — App Shell, Navigation & Spatial Architecture** — complete
- **V4 — Home 3.0: Signature Timer Surface**
- **V5 — Live Timer 3.0: Showcase Experience**
- **V6 — Saved Timers & Library Object System**
- **V7 — Workspace & Queue Visualization**
- **V8 — History & Analytics Visual Storytelling**
- **V9 — Motion, Microinteractions & Tactile Feedback**
- **V10 — Themes, Polish, Responsive QA & Visual Certification**

## Scope discipline

V1 deliberately changes **no production screen styling**.

V2 must first create reusable visual tokens/material primitives. V3–V9 then consume those primitives. V10 verifies the complete system.

A phase must not:
- rewrite timer semantics for visual reasons
- weaken accessibility
- use animation as timing truth
- introduce network-required assets for core UI
- bypass the performance/release gates
- ignore the V1 anti-style list
