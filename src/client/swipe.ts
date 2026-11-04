/** Gesture recognition only. Opening an action rail never enqueues marks or grades. */
export function classifySwipe(input: { dx: number; dy: number }): 'left' | 'right' | null {
  if (!Number.isFinite(input.dx) || !Number.isFinite(input.dy)) return null;
  const horizontal = Math.abs(input.dx);
  if (horizontal < 42 || horizontal < Math.abs(input.dy) * 1.3) return null;
  return input.dx < 0 ? 'left' : 'right';
}
