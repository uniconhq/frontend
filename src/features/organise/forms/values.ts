/**
 * A settings file's values as the server reads and takes them: plain JSON,
 * the file's own keys, with leaderboards, their columns and a task's groups
 * and values as lists of named entries. A form reads its fields from them and
 * writes what changed back into a copy, which the server writes into the file.
 */
export type Values = Record<string, unknown>;
export type Path = (string | number)[];

/** Whether `value` is a mapping, not a list or a scalar. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value at a path, or undefined when nothing is there. */
export function valueAt(values: unknown, path: Path): unknown {
  let at: unknown = values;
  for (const step of path) {
    if (typeof step === 'number') {
      if (!Array.isArray(at)) return undefined;
      at = at[step];
    } else {
      if (!isRecord(at)) return undefined;
      at = at[step];
    }
  }
  return at;
}

/** A field's text for a value. */
export function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function textAt(values: unknown, path: Path): string {
  return textOf(valueAt(values, path));
}

/**
 * Write one value at a path, making the mappings above it. `undefined`
 * removes the key; with `prune`, a mapping the removal left empty goes too,
 * down to (not including) the path's first `keep` steps.
 */
export function writeAt(
  values: Values,
  path: Path,
  value: unknown,
  { prune = false, keep = 1 }: { prune?: boolean; keep?: number } = {},
): void {
  if (path.length === 0) return;
  if (value === undefined) {
    remove(values, path);
    if (!prune) return;
    for (let end = path.length - 1; end >= keep; end -= 1) {
      const above = valueAt(values, path.slice(0, end));
      if (!isRecord(above) || Object.keys(above).length > 0) return;
      remove(values, path.slice(0, end));
    }
    return;
  }
  let at: unknown = values;
  for (let index = 0; index < path.length - 1; index += 1) {
    const step = path[index]!;
    const holder = at as Record<string | number, unknown>;
    if (!isRecord(holder[step]) && !Array.isArray(holder[step])) holder[step] = {};
    at = holder[step];
  }
  (at as Record<string | number, unknown>)[path[path.length - 1]!] = value;
}

function remove(values: Values, path: Path): void {
  const holder = valueAt(values, path.slice(0, -1));
  const last = path[path.length - 1]!;
  if (Array.isArray(holder) && typeof last === 'number') holder.splice(last, 1);
  else if (isRecord(holder)) delete holder[last];
}

/**
 * A finite number as YAML 1.2's core schema reads one, as the forge does: a
 * decimal with an optional sign and exponent, or `0o` octal or `0x` hex.
 */
const CORE_NUMBER =
  /^([-+]?(\.\d+|\d+(\.\d*)?)([eE][-+]?\d+)?|0o[0-7]+|0x[0-9a-fA-F]+)$/;

/**
 * A number typed into a field: undefined when empty, NaN when it is not a
 * number, which the form shows as an error and will not save.
 */
export function numberOf(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (!CORE_NUMBER.test(trimmed)) return Number.NaN;
  if (trimmed.startsWith('0o')) return parseInt(trimmed.slice(2), 8);
  return Number(trimmed);
}

/**
 * A value typed into a field whose type is not known: a number when it reads
 * as one, `true` or `false`, else the text. Empty is no value.
 */
export function scalarOf(text: string): string | number | boolean | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!DECIMAL.test(trimmed)) return text;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : text;
}

const DECIMAL = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/**
 * A number field's value: none when empty, else the number, or the text when
 * it is not one, for the forge to refuse.
 */
export function numberValue(text: string): number | string | undefined {
  const value = numberOf(text);
  if (value === undefined) return undefined;
  return Number.isFinite(value) ? value : text;
}

/** Why a number field cannot be saved, or undefined when it can. */
export function numberProblem(text: string): string | undefined {
  const value = numberOf(text);
  if (value === undefined) return undefined;
  if (Number.isNaN(value)) return 'Enter a number.';
  if (!Number.isFinite(value)) return 'Enter a smaller number.';
  return undefined;
}

/** A copy of the values a form may change without touching what it read. */
export function copyOf<T>(values: T): T {
  return structuredClone(values);
}

/** A named entry of a list the server gives for a keyed mapping. */
export type Named = Record<string, unknown>;

/** The entries of a named list, or none while the part is not one. */
export function entriesAt(values: unknown, path: Path): Named[] | null {
  const found = valueAt(values, path);
  if (found === undefined) return [];
  return Array.isArray(found) && found.every(isRecord) ? found : null;
}
