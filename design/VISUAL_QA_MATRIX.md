# Timer — Visual QA Matrix
## Phase V1 · Redesign Verification Baseline

Use this matrix during V2–V10. A visual phase is incomplete if the affected surfaces are not checked against their applicable rows.

---

## 1. Viewports

| ID | Viewport | Required |
|---|---:|---|
| P320 | 320 × 640 | Yes |
| P360 | 360 × 800 | Yes |
| P390 | 390 × 844 | Yes |
| P430 | 430 × 932 | Yes |
| LPHONE | 844 × 390 | Yes |
| T768 | 768 × 1024 | Yes |
| T1024 | 1024 × 768 | Yes |
| D1280 | 1280 × 800 | Yes |
| D1440 | 1440 × 900 | Yes |

---

## 2. Themes

- Dark
- Light
- OLED
- High contrast
- Forced colors

---

## 3. Accessibility variants

- default motion
- reduced motion
- normal text
- large text
- x-large text
- keyboard only
- touch targets
- screen-reader semantic order

---

## 4. Core states

### Timer
- idle
- running
- paused
- overtime
- warning threshold
- completed
- manually ended

### Saved Timer
- normal
- hover
- selected
- pinned
- favorite
- archived
- disabled/missing dependency

### Queue
- idle preset
- running
- paused
- looping
- current item
- queued item
- completed item
- skipped item
- unavailable item
- stop-on-completion
- overtime step
- repeated step

### Workspace
- one timer
- two timers
- many timers
- focused
- paused
- overtime
- mixed states

### Navigation / Sheets
- default
- active
- focus
- open modal
- nested editor
- destructive confirmation

---

## 5. Visual regression questions

For every redesigned screen:

1. Is the primary action visually dominant?
2. Can important state be recognized without reading all metadata?
3. Is any border/card unnecessary?
4. Are floating surfaces visually distinct from content surfaces?
5. Does accent color communicate something meaningful?
6. Does the screen remain legible in grayscale?
7. Does OLED avoid unnecessary luminous area?
8. Does reduced motion remove nonessential movement cleanly?
9. Are focus states obvious without breaking visual polish?
10. Do numbers remain stable when digits change?
11. Is the screen still coherent with 200% browser zoom?
12. Does mobile safe-area padding remain correct?
13. Are destructive controls visually separated from primary actions?
14. Is any background effect competing with the timer display?
15. Is the visual hierarchy still clear with localization expansion?
16. Does RTL remain structurally valid where supported?

---

## 6. Performance checks for visual work

- no animation as timing source
- no frame loop solely for idle decoration
- blur regions bounded
- background visual work suppressed when hidden
- reduced-motion path tested
- large active-timer count tested
- OLED cost reviewed
- release shell/performance gate passes

---

## 7. Definition of done

A visual phase is complete only when:

- affected screens pass the applicable viewport/state/theme matrix
- no existing functional regression is introduced
- accessibility modes remain intentional
- performance gate passes
- changes conform to `design/VISUAL_DESIGN_CONTRACT.md`
