/**
 * The part of a test a file in its folder is, by its name, as the format
 * names it (TASK-FORMAT 1.2): `answer.txt` is the `answer`, a folder
 * `data/...` is the `data`, and `test.yaml` holds the test's values.
 */
export function partOf(entry: string): string {
  const [first = ''] = entry.split('/');
  const dot = first.indexOf('.');
  return dot < 0 ? first : first.slice(0, dot);
}
