/**
 * The launch grid, one layout for the whole light show: the simulation, the exported
 * show package and fleet health all put aircraft n on the same pad.
 *
 * Show frame: metres, x to the right as the audience sees it, y away from the
 * audience, z up (the exported package's frame). Rows run front to back from the
 * far side: row A is the back row, as the pad crew walks it.
 */

export const PAD_SPACING_M = 3;

/** Grid width for a fleet: close to 5:3 across, as show pads are laid out. */
export const padCols = (n: number) => Math.max(5, Math.round(Math.sqrt(n * 1.7)));

/** Pad label for the n-th aircraft (0-based) on a grid `cols` wide, e.g. "C07" (row letter, column number). */
export function padLabel(n: number, cols: number) {
  const row = Math.floor(n / cols), col = n % cols;
  const letters = row < 26 ? String.fromCharCode(65 + row) : String.fromCharCode(64 + Math.floor(row / 26)) + String.fromCharCode(65 + (row % 26));
  return `${letters}${String(col + 1).padStart(2, '0')}`;
}

/** Where aircraft `i` of `n` sits, centred on the show origin. */
export function padXY(i: number, n: number): { x: number; y: number } {
  const cols = padCols(n), rows = Math.ceil(n / cols);
  return { x: ((i % cols) - (cols - 1) / 2) * PAD_SPACING_M, y: -(Math.floor(i / cols) - (rows - 1) / 2) * PAD_SPACING_M };
}
