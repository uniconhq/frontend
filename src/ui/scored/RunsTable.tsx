import type { ReactNode } from 'react';
import tableClasses from '@/ui/table.module.css';
import { entryTitle } from './scored-text';
import classes from './scored.module.css';

/** One column of a group's runs: its heading, and what each run shows in it. */
export type RunColumn<Run> = { title: string; cell: (run: Run) => ReactNode };

/** A group's runs as a table, one row each, so their fields line up. */
export function RunsTable<Run>({
  group,
  runs,
  columns,
  keyOf,
}: {
  group: string;
  runs: Run[];
  columns: RunColumn<Run>[];
  keyOf: (run: Run) => string;
}) {
  const title = entryTitle(group);
  return (
    <section aria-label={`Group ${title}`} className={classes.group}>
      <h4 className={classes.groupTitle}>{title}</h4>
      <div className={tableClasses.scroll}>
        <table className={`${tableClasses.table} ${tableClasses.compact}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.title}>{column.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={keyOf(run)}>
                {columns.map((column) => (
                  <td key={column.title}>{column.cell(run)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
