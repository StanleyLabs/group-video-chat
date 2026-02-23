/**
 * Returns Tailwind grid classes based on peer count.
 * Uses auto row sizing so rows shrink to content and place-content-center
 * clusters them together instead of stretching to fill the container.
 */
export function getGridClasses(count: number): string {
  const base = 'grid gap-2 place-content-center'
  if (count === 1) return `${base} grid-cols-1`
  if (count === 2) return `${base} grid-cols-1 sm:grid-cols-2`
  if (count === 3) return `${base} grid-cols-1 sm:grid-cols-3`
  if (count === 4) return `${base} grid-cols-1 sm:grid-cols-2`
  if (count === 5) return `${base} grid-cols-2 sm:grid-cols-3`
  if (count === 6) return `${base} grid-cols-2 sm:grid-cols-3`
  if (count === 7) return `${base} grid-cols-2 sm:grid-cols-4`
  if (count === 8) return `${base} grid-cols-2 sm:grid-cols-4`
  if (count === 9) return `${base} grid-cols-3 sm:grid-cols-3`
  return `${base} grid-cols-4 sm:grid-cols-5`
}
