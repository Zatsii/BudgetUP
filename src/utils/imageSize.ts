// Pure image sizing math, tested with node --test.

/** Longest edge, in pixels, that stored and parsed receipt photos are scaled down to. */
export const RECEIPT_LONG_EDGE = 1600;
export const RECEIPT_JPEG_QUALITY = 0.8;

/**
 * Size that fits `width` x `height` within `maxLongEdge` on the long side, keeping the aspect
 * ratio. Images already small enough are left as-is (never upscaled).
 */
export function fitLongEdge(width: number, height: number, maxLongEdge = RECEIPT_LONG_EDGE) {
  const longEdge = Math.max(width, height);
  if (!(longEdge > maxLongEdge)) return { width, height, scaled: false };
  const scale = maxLongEdge / longEdge;
  return {
    width: width >= height ? maxLongEdge : Math.round(width * scale),
    height: height > width ? maxLongEdge : Math.round(height * scale),
    scaled: true,
  };
}
