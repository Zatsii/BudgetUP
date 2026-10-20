/**
 * One line of recognised text. Box in pixels, origin top-left. `angle`: the line's slope in
 * degrees, positive when it runs down to the right (a photo rotated clockwise).
 */
export type OcrLine = { text: string; x: number; y: number; width: number; height: number; angle: number };
