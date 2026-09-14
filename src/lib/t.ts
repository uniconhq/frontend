/**
 * English only in v1, but every user-visible string goes through one function,
 * so adding a second language is a change to this file and a lookup table
 * rather than a hunt through every component.
 */
export function t(text: string): string {
  return text;
}
