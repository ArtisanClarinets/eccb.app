## 2026-03-08 - Added Hover and Focus Styles to Stand Tools
**Learning:** Found several tools (Metronome, Pitch Pipe, Audio Player) that lacked proper focus and hover states for their buttons and select dropdowns, reducing keyboard accessibility.
**Action:** Always add `hover:` and `focus-visible:` utility classes (like `focus-visible:ring-2 focus-visible:ring-ring`) to interactive elements to ensure visual feedback and keyboard accessibility.
## 2026-03-09 - Keyboard Accessibility for Smart Navigation Editor
**Learning:** Discovered interactive elements in `SmartNavEditor` (hotspots, edit toggle buttons, configuration form inputs/buttons) lacked clear keyboard focus indicators, rendering keyboard navigation difficult or invisible. Specifically, `div` elements functioning as interactive hotspots need proper focus rings.
**Action:** Always add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1` to custom interactive components (like divs acting as buttons) and standard focus ring utilities (`focus-visible:ring-2`) to inputs/selects to ensure keyboard accessibility matches native expectations.
