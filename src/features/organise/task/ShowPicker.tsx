import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { IconButton } from '@/ui/IconButton';
import { Select } from '@/ui/Select';
import {
  MOMENTS,
  hidesAlways,
  momentsOf,
  renamedInShow,
  runEntries,
  runMoments,
  showSpot,
  withMoment,
  withRunMoment,
  withoutInShow,
  type Moment,
  type RunRow,
  type ScoreGroup,
  type Show,
  type ShowKind,
} from './scoring-model';
import { FIRST_NOT_PASSED } from '@/ui/scored/scored-text';
import { Group } from '@/ui/layout';
import classes from './task.module.css';

/** A part `show` can name, by its name, as the grid calls it. */
export type ShowRow = {
  name: string;
  label: string;
};

/** The one warning, on a row: it was shown always, and entrants have been graded. */
const SEEN = 'Entrants may have seen this. The save asks before hiding it.';

/** What a run entry's `of` reads as in its picker. */
function ofLabel(of: string): string {
  if (of === 'all') return 'all, every run';
  if (of === FIRST_NOT_PASSED) return 'The first failed run';
  return of;
}

/**
 * The rows of a section, then each name `show` lists there that no row has,
 * so it can be turned off. The save says why it is refused.
 */
function withListed(rows: ShowRow[], listed: string[]): ShowRow[] {
  const named = new Set(rows.map((row) => row.name));
  return [
    ...rows,
    ...[...new Set(listed)]
      .filter((name) => !named.has(name))
      .map((name) => ({ name, label: name })),
  ];
}

/**
 * What entrants see of a submission, and when: a row for each part `show`
 * can name, in sections, and a box to tick for each moment. Always shows a part
 * at both later moments too, so it turns them on, greyed; the later two are
 * separate, either may come first, and both may be on. A run entry picks
 * runs by a group, `all` or the first run not passed, with a row for each
 * field of a run.
 */
export function ShowPicker({
  show,
  saved,
  graded,
  disabled,
  values,
  settings,
  outputs,
  fields,
  groups,
  runs,
  troubles,
  onChange,
}: {
  show: Show;
  /** `show` as the card read it, so hiding what was shown always is warned of. */
  saved: Show;
  /** A graded submission exists, so what was shown always has been seen. */
  graded: boolean;
  disabled: boolean;
  values: ShowRow[];
  /** The task's settings, which every run shares. */
  settings: ShowRow[];
  /** What steps done once give, and whether it compiled. */
  outputs: ShowRow[];
  /** What each run has: its repeated inputs, its verdict and the like, and its outputs. */
  fields: ShowRow[];
  groups: ScoreGroup[];
  runs: RunRow[];
  /** What the last save said of each row, by `showSpot`. */
  troubles: ReadonlyMap<string, string>;
  onChange: (show: Show) => void;
}) {
  // A run entry added with no field on yet, which `show` cannot hold.
  const [added, setAdded] = useState<string[]>([]);
  const listed = runEntries(show);
  const choices = ['all', ...groups.map((group) => group.name), FIRST_NOT_PASSED];
  // One whose group was since renamed or removed, with nothing on, is gone.
  const entries = [
    ...new Set([...listed, ...added.filter((of) => choices.includes(of))]),
  ];
  const free = choices.filter((of) => !entries.includes(of));

  const listedOf = (kind: ShowKind) =>
    MOMENTS.flatMap(({ value }) => show[value][kind]);
  const section = (kind: ShowKind, title: string, rows: ShowRow[], empty: string) => {
    const all = withListed(rows, listedOf(kind));
    return (
      <tbody key={kind}>
        <tr>
          <th colSpan={4} scope="colgroup" className={classes.showSection}>
            {title}
          </th>
        </tr>
        {all.length === 0 && (
          <tr>
            <td colSpan={4} className={classes.showEmpty}>
              {empty}
            </td>
          </tr>
        )}
        {all.map((row) => (
          <Row
            key={row.name}
            row={row}
            moments={momentsOf(show, kind, row.name)}
            trouble={troubles.get(showSpot(kind, row.name))}
            warn={
              graded && hidesAlways(saved, show, { kind, name: row.name })
                ? SEEN
                : undefined
            }
            disabled={disabled}
            onToggle={(moment, on) =>
              onChange(withMoment(show, kind, row.name, moment, on))
            }
          />
        ))}
      </tbody>
    );
  };

  return (
    <>
      <div className={classes.showFrame}>
        <table className={classes.showGrid} aria-label="What entrants see">
          <thead>
            <tr>
              <th scope="col">Shown</th>
              {MOMENTS.map((moment) => (
                <th key={moment.value} scope="col">
                  {moment.label}
                </th>
              ))}
            </tr>
          </thead>
          {section('values', 'Values', values, 'No values yet.')}
          {section(
            'inputs',
            'Shared inputs',
            settings,
            'The task sets no input that every run shares.',
          )}
          {section(
            'outputs',
            'Once outputs',
            outputs,
            'The workflow gives nothing once for every run.',
          )}
          {entries.map((of) => {
            const listedFields = MOMENTS.flatMap(({ value }) =>
              show[value].runs
                .filter((entry) => entry.of === of)
                .flatMap((entry) => entry.fields),
            );
            return (
              <tbody key={of} aria-label={`Runs: ${ofLabel(of)}`}>
                <tr>
                  <th colSpan={4} scope="colgroup" className={classes.showSection}>
                    <Group gap={6}>
                      <Select
                        label="Runs of"
                        labelHidden
                        width="md"
                        value={of}
                        disabled={disabled}
                        options={[...new Set([...choices, of])].map((choice) => ({
                          value: choice,
                          label: ofLabel(choice),
                          disabled: choice !== of && entries.includes(choice),
                        }))}
                        onChange={(next) => {
                          if (listed.includes(of))
                            onChange(renamedInShow(show, 'runs', of, next));
                          setAdded((before) =>
                            before.map((each) => (each === of ? next : each)),
                          );
                        }}
                      />
                      {!disabled && (
                        <IconButton
                          sign="✕"
                          label={`Remove the runs of ${of}`}
                          onClick={() => {
                            onChange(withoutInShow(show, 'runs', of));
                            setAdded((before) => before.filter((each) => each !== of));
                          }}
                        />
                      )}
                    </Group>
                    {troubles.has(showSpot('runs', of)) && (
                      <BodyText size="sm" tone="secondary">
                        {troubles.get(showSpot('runs', of))}
                      </BodyText>
                    )}
                  </th>
                </tr>
                {withListed(fields, listedFields).map((row) => (
                  <Row
                    key={row.name}
                    row={row}
                    named={`${row.label} of ${of}`}
                    moments={runMoments(show, of, row.name)}
                    trouble={troubles.get(showSpot('runs', of, row.name))}
                    warn={
                      graded &&
                      hidesAlways(saved, show, {
                        kind: 'runs',
                        of,
                        field: row.name,
                        runs,
                        groups,
                      })
                        ? SEEN
                        : undefined
                    }
                    disabled={disabled}
                    onToggle={(moment, on) =>
                      onChange(withRunMoment(show, of, row.name, moment, on))
                    }
                  />
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      {entries.length === 0 && (
        <BodyText size="sm" tone="secondary">
          No runs are shown. Add runs to show a group&apos;s, every run&apos;s or the
          first run not passed.
        </BodyText>
      )}
      {!disabled && (
        <div className={classes.ownWidth}>
          <Button
            variant="secondary"
            disabled={free.length === 0}
            onClick={() => {
              const next = free[0];
              if (next !== undefined) setAdded((before) => [...before, next]);
            }}
          >
            Add runs
          </Button>
        </div>
      )}
    </>
  );
}

function Row({
  row,
  named = row.label,
  moments,
  trouble,
  warn,
  disabled,
  onToggle,
}: {
  row: ShowRow;
  /** What its boxes are called, when its label alone does not tell its section. */
  named?: string;
  moments: Moment[];
  /** What the last save said of it. */
  trouble: string | undefined;
  warn: string | undefined;
  disabled: boolean;
  onToggle: (moment: Moment, on: boolean) => void;
}) {
  const always = moments.includes('always');
  return (
    <tr data-show-part={row.name}>
      <th scope="row">
        {row.label}
        {trouble !== undefined && (
          <BodyText size="sm" tone="secondary">
            {trouble}
          </BodyText>
        )}
        {warn !== undefined && (
          <BodyText size="sm" tone="secondary">
            {warn}
          </BodyText>
        )}
      </th>
      {MOMENTS.map((moment) => (
        <td key={moment.value}>
          <Checkbox
            label={`${named}, ${moment.label}`}
            labelHidden
            checked={always || moments.includes(moment.value)}
            disabled={disabled || (always && moment.value !== 'always')}
            onChange={(on) => onToggle(moment.value, on)}
          />
        </td>
      ))}
    </tr>
  );
}
