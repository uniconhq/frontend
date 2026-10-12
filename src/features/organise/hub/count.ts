/** A number of things, with the word for one or for many: "1 team", "3 teams". */
export function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}
