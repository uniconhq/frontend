/**
 * Returns an array representing a range of numbers.
 *
 * @param n number of elements
 * @param start starting value
 * @param interval interval between elements
 * @returns an array of numbers from start to start + n * interval
 */
export function range(n: number, start: number = 0, interval: number = 1): number[] {
  return [...Array(n)].map((_, i) => start + i * interval);
}
