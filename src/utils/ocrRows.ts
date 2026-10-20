// Rebuilds a receipt's printed rows from OCR lines with positions. Pure, tested with node --test.
//
// OCR engines return lines in no dependable order (ML Kit's blocks are scattered) and may split
// one printed row into pieces: "Latte Macchiato" on the left, "9.00" on the right. Rows are
// rebuilt geometrically: straighten by the page's median slope, group lines whose centres sit
// at the same height, then read each row left to right.

import type { OcrLine } from '../../modules/receipt-ocr/types.ts';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** One string per printed row, top to bottom. Pieces of a row are joined with two spaces. */
export function linesToRows(lines: OcrLine[]): string[] {
  const usable = lines.filter((l) => l.text.trim() && l.height > 0);
  if (usable.length === 0) return [];

  // Long lines give the best slope estimate; short ones ("9.00") are noisy.
  const longest = [...usable].sort((a, b) => b.width - a.width).slice(0, Math.max(3, Math.ceil(usable.length / 2)));
  const theta = (median(longest.map((l) => (Number.isFinite(l.angle) ? l.angle : 0))) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const lineHeight = median(usable.map((l) => l.height));

  // Straightened centre of each line: rotate by -theta.
  const placed = usable
    .map((l) => {
      const cx = l.x + l.width / 2;
      const cy = l.y + l.height / 2;
      return { text: l.text.trim(), left: l.x * cos + l.y * sin, y: -cx * sin + cy * cos };
    })
    .sort((a, b) => a.y - b.y);

  const rows: { y: number; parts: typeof placed }[] = [];
  for (const p of placed) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(p.y - row.y) <= lineHeight * 0.5) {
      row.parts.push(p);
      row.y = row.parts.reduce((s, q) => s + q.y, 0) / row.parts.length;
    } else {
      rows.push({ y: p.y, parts: [p] });
    }
  }
  return rows.map((r) => r.parts.sort((a, b) => a.left - b.left).map((p) => p.text).join('  '));
}
