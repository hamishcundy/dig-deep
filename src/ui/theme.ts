// Shared text look: a bundled pixel font (Jersey 10, OFL licence) with clear digits.
// It has one weight, so emphasis comes from size and colour rather than bold.
export const FONT = '"Jersey 10", sans-serif';

export function textStyle(size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color };
}
