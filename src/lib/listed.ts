/** Words joined as a list is said: "a", "a and b", "a, b and c". */
export function listed(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}
