import type { components } from '@/api/schema';
import type { InputField } from '@/api/types';

/** The parts of an input given once per row, or none when it is one field. */
export function partsOf(input: InputField): NonNullable<InputField['parts']> | null {
  const parts = input.parts;
  return Array.isArray(parts) && parts.length > 0 ? parts : null;
}

/** What an upload box is called: the row's title, or "Part 1", "Part 2". */
export function partTitle(title: string | null | undefined, index: number): string {
  return title !== null && title !== undefined && title !== ''
    ? title
    : `Part ${String(index + 1)}`;
}

/**
 * A file's name as the page shows it: its path under its input's folder,
 * `files/<input>/`, so a file in a folder of its own, or one part of a
 * tuple, is told apart from another of the same last name.
 */
export function nameOf(path: string): string {
  const parts = path.split('/');
  if (parts[0] === 'files' && parts.length > 2) return parts.slice(2).join('/');
  return path.slice(path.lastIndexOf('/') + 1);
}

type SubmittedInput = components['schemas']['SubmittedFileInput'];
type SubmittedPart = components['schemas']['SubmittedPart'];

/** One file a submission was made with, named by its input and part. */
export type SubmittedFile = { key: string; label: string; path: string };
/** One value a submission was given, named by its input and part. */
export type SubmittedValue = { key: string; label: string; value: string };

/**
 * What a submission was made with, input by input: each input by its label
 * as the form names it (its key only for an input the task no longer has),
 * and each part of an input given in parts under it, as "<input>, <part>",
 * the part by its row's title or "Part n".
 */
export function submittedItems(
  inputs: Readonly<Record<string, SubmittedInput>>,
  fields: readonly InputField[],
): { files: SubmittedFile[]; values: SubmittedValue[] } {
  const files: SubmittedFile[] = [];
  const values: SubmittedValue[] = [];
  const add = (key: string, label: string, given: SubmittedPart) => {
    for (const path of given.files) files.push({ key: `${key}:${path}`, label, path });
    if (given.value !== null) values.push({ key, label, value: String(given.value) });
  };
  for (const [id, input] of Object.entries(inputs)) {
    const field = fields.find((each) => each.id === id);
    const label = field?.label ?? id;
    add(id, label, input);
    const rows = field === undefined ? null : partsOf(field);
    const parts = Object.entries(input.parts ?? {})
      .map(([number, part]) => ({ number: Number(number), part }))
      .filter(({ number }) => Number.isInteger(number) && number >= 1)
      .sort((a, b) => a.number - b.number);
    for (const { number, part } of parts) {
      const title = partTitle(rows?.[number - 1]?.title, number - 1);
      add(`${id}.${String(number)}`, `${label}, ${title}`, part);
    }
  }
  return { files, values };
}
