import { emptyTuple, type AxisValues } from '../forms/task-values';

function stemOf(path: string) {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return dot > slash
    ? { stem: path.slice(0, dot), ending: path.slice(dot + 1).toLowerCase() }
    : { stem: path, ending: '' };
}

/** Pair endings to existing columns, reusing a matching row or an empty row. */
export function pairRunFiles(
  files: File[],
  axis: AxisValues,
  columns: readonly string[],
) {
  const endings = new Map(
    columns.map((input) => {
      const sample = axis.tuples
        .map((tuple) => tuple.cells[input]?.value ?? '')
        .find((value) => stemOf(value).ending !== '');
      return [
        input,
        sample === undefined
          ? input === 'input'
            ? 'in'
            : input === 'answer'
              ? 'ans'
              : input
          : stemOf(sample).ending,
      ];
    }),
  );
  const next: AxisValues = {
    ...axis,
    tuples: axis.tuples.map((tuple) => ({ ...tuple, cells: { ...tuple.cells } })),
  };
  const pairs: { file: File; row: number; input: string }[] = [];
  const problems: string[] = [];
  const assigned = new Set<string>();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const { stem, ending } = stemOf(path);
    const matches =
      columns.length === 1
        ? [...columns]
        : columns.filter((input) => input === ending || endings.get(input) === ending);
    const input = matches.length === 1 ? matches[0] : undefined;
    if (input === undefined) {
      problems.push(`No column matches ${file.name}.`);
      continue;
    }
    let row = next.tuples.findIndex(
      (tuple) =>
        tuple.title === stem ||
        Object.values(tuple.cells).some(
          (cell) =>
            !cell.entrant && cell.value !== '' && stemOf(cell.value).stem === stem,
        ),
    );
    if (row < 0)
      row = next.tuples.findIndex(
        (tuple) =>
          tuple.title === '' &&
          Object.values(tuple.cells).every(
            (cell) => !cell.entrant && cell.value === '',
          ),
      );
    if (row < 0) {
      row = next.tuples.length;
      next.tuples.push(emptyTuple(axis.inputs));
    }
    const tuple = next.tuples[row];
    if (tuple === undefined) throw new Error('A paired run row must exist.');
    const cell = `${String(row)}:${input}`;
    if (assigned.has(cell)) {
      problems.push(`Two files fill the same cell: ${file.name}.`);
      continue;
    }
    assigned.add(cell);
    next.tuples[row] = {
      ...tuple,
      title: tuple.title || stem,
      cells: { ...tuple.cells, [input]: { entrant: false, value: path } },
    };
    pairs.push({ file, row, input });
  }
  return { axis: next, pairs, problems };
}

/** A replacement keeps its own path; a new cell never takes another cell’s path. */
export function cellPath(
  axes: AxisValues[],
  table: number,
  row: number,
  input: string,
): string {
  const current = axes[table]?.tuples[row]?.cells[input]?.value ?? '';
  const others = new Set(
    axes.flatMap((axis, index) =>
      axis.tuples.flatMap((tuple, at) =>
        Object.entries(tuple.cells)
          .filter(([id]) => index !== table || at !== row || id !== input)
          .map(([, cell]) => cell.value),
      ),
    ),
  );
  if (current.startsWith('runs/') && !others.has(current)) return current;
  const base = `runs/${String(table)}/${String(row)}/${input}`;
  let path = base;
  let suffix = 2;
  while (others.has(path)) {
    path = `${base}_${String(suffix)}`;
    suffix += 1;
  }
  return path;
}
