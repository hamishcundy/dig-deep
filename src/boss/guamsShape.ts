// Guams' poses, in the sketch units his art is drawn in (see guamsArt.ts). The
// art and the behaviour both use these, so hit boxes line up with the drawing.
// All face left; facing right mirrors them.

export const SKETCH_SCALE = 0.85; // sketch units to world px

export type GuamsPose = 'asleep' | 'fly' | 'rear';

interface PoseShape {
  w: number; // sketch size
  h: number;
  origin: [number, number]; // the point that sits at his position
  mouth: [number, number];
  patch: [number, number]; // the bare patch on his chest
  box: [number, number, number, number]; // x0, y0, x1, y1: the part that hurts to touch
}

export const POSES: Record<GuamsPose, PoseShape> = {
  asleep: { w: 310, h: 110, origin: [160, 74], mouth: [27, 86], patch: [104, 88], box: [30, 50, 290, 98] },
  fly: { w: 310, h: 180, origin: [140, 100], mouth: [20, 80], patch: [110, 116], box: [20, 60, 250, 126] },
  rear: { w: 270, h: 230, origin: [140, 140], mouth: [96, 22], patch: [106, 124], box: [96, 15, 176, 216] },
};

// A sketch point as an offset (world px) from his position.
export function offset(pose: GuamsPose, [sx, sy]: [number, number], facing: -1 | 1): { x: number; y: number } {
  const [ox, oy] = POSES[pose].origin;
  const x = (sx - ox) * SKETCH_SCALE;
  return { x: facing === -1 ? x : -x, y: (sy - oy) * SKETCH_SCALE };
}
