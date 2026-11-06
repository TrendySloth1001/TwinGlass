// One source of truth for the compact window's chrome, used by main (window size / aspect lock)
// and the renderer (CSS). Every gap between pieces is GAP, so the layout has one rhythm.

/** Gap between all pieces: title pills ↔ phone, phone ↔ control strip, phone ↔ nav dock. */
export const GAP = 6
/** Title strip with the traffic lights (macOS buttons at x 10, y 7, ~14 px tall: centre y 14). */
export const TITLE = 28
/** With a phone frame the title holds dock pills (22 px, top 3, centre 14) + GAP below them. */
export const FRAMED_TITLE = 3 + 22 + GAP
/** Control strip width. */
export const RAIL_WIDTH = 48
/** Width the strip adds to the window: strip + the gap before it. */
export const RAIL = RAIL_WIDTH + GAP
/** Navigation bar under the phone: 34 px dock + GAP (framed) or a 40 px strip (plain). */
export const NAV_DOCK = 34
export const NAV = NAV_DOCK + GAP
