import type { DeclaredInput } from '@/api/types';
import type { InputValues } from '../forms/task-values';

/** A choice of `options`, keeping a value the file has that is not one of them. */
export function choices(options: string[], value: string) {
  const all = value === '' || options.includes(value) ? options : [value, ...options];
  return all.map((option) => ({ value: option, label: option }));
}

export const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/** Each option chosen, in the order the workflow declares them. */
export function chosenOf(text: string): string[] {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

/** The options an entrant may pick from: those the task chose, or every one. */
export function offeredOf(declared: DeclaredInput, input: InputValues): string[] {
  const options = declared.options ?? [];
  const chosen = chosenOf(input.options);
  return chosen.length === 0
    ? options
    : options.filter((option) => chosen.includes(option));
}
