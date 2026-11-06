import type { components } from '../api/schema';

type DraftRun = components['schemas']['DraftRun'];
type DraftRuns = components['schemas']['DraftRuns'];

/** One axis's tuples as runs, as the forge reads a draft's `repeat`. */
function axisRuns(axis: unknown): { inputs: string[]; rows: DraftRun[] } {
  const { inputs = [], tuples = [] } = axis as {
    inputs?: string[];
    tuples?: unknown[];
  };
  if (inputs.length === 0) return { inputs, rows: [] };
  const rows = tuples.map((tuple) => {
    const mapping =
      typeof tuple === 'object' && tuple !== null && !Array.isArray(tuple)
        ? (tuple as Record<string, unknown>)
        : null;
    const cells: Record<string, unknown> = {};
    inputs.forEach((input, column) => {
      const value = Array.isArray(tuple)
        ? (tuple[column] as unknown)
        : mapping !== null
          ? mapping[input]
          : inputs.length === 1
            ? tuple
            : undefined;
      if (value !== undefined && value !== null && value !== 'entrant')
        cells[input] = value;
    });
    const title = mapping?.['title'];
    return {
      titles: typeof title === 'string' && title.trim() !== '' ? [title.trim()] : [],
      cells,
    };
  });
  return { inputs, rows };
}

/** A draft's runs crossed as the forge crosses them, first axis outermost. */
export function draftRunsOf(repeat: unknown[]): DraftRuns {
  const axes = repeat.map(axisRuns);
  let runs: DraftRun[] = [{ titles: [], cells: {} }];
  for (const axis of axes.filter((each) => each.inputs.length > 0))
    runs = runs.flatMap((run) =>
      axis.rows.map((row) => ({
        titles: [...run.titles, ...row.titles],
        cells: { ...run.cells, ...row.cells },
      })),
    );
  return { runs, count: runs.length, axes: axes.map((axis) => axis.rows) };
}
