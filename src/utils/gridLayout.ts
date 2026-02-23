/**
 * Returns Tailwind grid classes based on peer count.
 * - 1-3: single column on mobile, N columns on desktop
 * - >3: 2 columns default, 3 columns if divisible by 3
 */
// Old layout just in case
// const base = 'grid gap-2 [grid-auto-rows:1fr] place-content-center'

export function getGridClasses(count: number): string {
  const base = 'grid gap-2 place-content-center'
  if (count === 1) return `${base} grid-cols-1`
  if (count === 2) return `${base} grid-cols-1 sm:grid-cols-2`
  if (count === 3) return `${base} grid-cols-1 sm:grid-cols-3`
  if (count % 3 === 0) return `${base} grid-cols-2 sm:grid-cols-3`
  return `${base} grid-cols-2`
}
