import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { FormulaLine, FormulaTiles } from '../formula/Editor';
import { BLOCKS_UNLOADED, type Catalogue } from '../formula/catalogue';
import {
  describeFormula,
  readLine,
  type FormulaScope,
  type Reading,
} from '../formula/parse';
import { useFormulaTarget } from '../formula/target';
import { treeQuery } from '../files/place';
import { FieldBox } from '../contest/ContestFile';
import type { TaskValues } from '../forms/task-values';
import { BuildCard, CardPart } from './BuildCard';
import type { TaskPlace } from './build-data';
import { BoxGraph } from './BoxGraph';
import { TASK_PALETTE, type GraphBox, type GraphWire, type Shape } from './graph';
import {
  FACTS,
  WHEN,
  axisColumns,
  columnsOf,
  freshKey,
  inGroup,
  outputColumns,
  pickFor,
  printed,
  renamed,
  runsOf,
  scopeOf,
  sourcesOf,
  troublesOf,
  valueTree,
  withLine,
  type Column,
  type RunRow,
  type ScoreGroup,
  type ScoreValue,
  type When,
} from './scoring-model';
import classes from './task.module.css';

const SCORING: Shape = { width: 176, gap: 40 };

/** How far the picked workflow file has been read, for its outputs. */
export type WorkflowRead = 'loading' | 'failed' | 'ready';

const WORKFLOW_UNREAD =
  'The workflow could not be read, so the outputs its runs give are not known and the formulas cannot be shown or checked.';

/**
 * How a submission is scored: what one run gives, the groups, the result as
 * a flow, and a card per value. Only a run workflow has it.
 */
export function ScoringCard({
  place,
  values,
  workflowText,
  workflowRead,
  graded,
  disabled,
  errors,
  onChange,
  onProblems,
}: {
  place: TaskPlace;
  values: TaskValues;
  /** The workflow file, so the runs' columns are its outputs. */
  workflowText: unknown;
  /** Until it reads, a formula is not checked, so no output is called unknown. */
  workflowRead: WorkflowRead;
  /** A graded submission exists, so what is shown now has been seen. */
  graded: boolean;
  disabled: boolean;
  errors: DefinitionError[];
  onChange: (change: Partial<TaskValues>) => void;
  /** What stops the save: a clash, a loop, a group with no runs, a formula. */
  onProblems: (problems: string[]) => void;
}) {
  const blocks = $api.useQuery('get', '/api/v1/blocks');
  const catalogue = blocks.data ?? null;
  const tree = useQuery({ ...treeQuery(place, ''), retry: false });
  const files = (tree.data ?? [])
    // The forge never serves task.yaml, nor the plans it writes itself.
    .filter((entry) => entry.path !== 'task.yaml' && entry.path !== 'plans')
    .map((entry) => (entry.kind === 'directory' ? `${entry.path}/` : entry.path));
  const outputs = useMemo(() => outputColumns(workflowText), [workflowText]);
  const columns = useMemo(() => columnsOf(outputs), [outputs]);
  // A formula also reads each input an axis fills, as a column of its run.
  const readable = useMemo(
    () => [...columns, ...axisColumns(values.axes, values.inputs)],
    [columns, values.axes, values.inputs],
  );
  const rows = runsOf(values.axes);
  const [chosen, setChosen] = useState<string | null>(null);
  // The when as read. A part shown now stays shown, even after the select moves.
  const [savedShow] = useState(values.show);
  const [wasName, setWasName] = useState<Record<string, string>>({});
  const remember = (key: string, name: string) =>
    setWasName((known) => (key in known ? known : { ...known, [key]: name }));
  const target = useFormulaTarget();
  const scope = useMemo(
    () =>
      catalogue === null || workflowRead !== 'ready'
        ? null
        : scopeOf(values.scoreGroups, values.scoreValues, readable, catalogue),
    [catalogue, readable, values.scoreGroups, values.scoreValues, workflowRead],
  );
  const readings = useMemo(() => {
    if (catalogue === null || scope === null) return {};
    return Object.fromEntries(
      values.scoreValues.map((value) => [
        value.key,
        readLine(printed(value, catalogue), scope, catalogue),
      ]),
    );
  }, [catalogue, scope, values.scoreValues]);
  const troubles = troublesOf(values.scoreGroups, values.scoreValues, readings);
  const blocked = [
    ...troubles.values(),
    ...values.scoreValues.flatMap((value) => {
      const reading = readings[value.key];
      if (reading === undefined) return [];
      return [
        ...(reading.unread === null ? [] : [reading.unread.message]),
        ...reading.problems.map((problem) => problem.message),
      ];
    }),
  ];
  const blockedKey = blocked.join('\n');
  useEffect(() => {
    onProblems(blockedKey === '' ? [] : blockedKey.split('\n'));
  }, [blockedKey, onProblems]);
  const setValues = (scoreValues: ScoreValue[]) => onChange({ scoreValues });
  const setGroups = (scoreGroups: ScoreGroup[]) => onChange({ scoreGroups });
  const setShow = (name: string, when: When) =>
    onChange({ show: { ...values.show, [name]: when } });

  const shown = rows.length > 5 ? rows.slice(0, 4) : rows;
  const more = rows.length - shown.length;

  return (
    <BuildCard
      id="scoring"
      title="Scoring"
      line="What one submission gives, which runs each group holds, and the values that make its result."
    >
      {blocks.isError && <BodyText>{BLOCKS_UNLOADED}</BodyText>}
      {workflowRead === 'failed' && <BodyText>{WORKFLOW_UNREAD}</BodyText>}
      <CardPart
        title="What one submission gives"
        line="One submission runs once on each row. The numbers here are made up, to show the shape."
      >
        {rows.length === 0 ? (
          <BodyText>
            No runs yet, so a submission gives nothing until the runs have a row.
          </BodyText>
        ) : (
          <table className={classes.runs}>
            <thead>
              <tr>
                <th>Run</th>
                {columns.map((column) => (
                  <th key={column.name}>
                    {column.title ?? column.name}
                    {column.unit === null ? '' : ` (${column.unit})`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr key={row.id}>
                  <th>{row.title}</th>
                  {columns.map((column) => (
                    <td key={column.name}>{example(column, index)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {more > 0 && <BodyText>and {String(more)} more runs</BodyText>}
        <BodyText size="sm">
          Every run also gives {readable.map((column) => column.name).join(', ')}. A
          value reads {FACTS.map((fact) => fact.name).join(', ')} too.
        </BodyText>
      </CardPart>
      <CardPart
        title="Groups"
        line="A dot puts that run in the group. all holds every run. A group is shared by every value."
      >
        <Groups
          rows={rows}
          groups={values.scoreGroups}
          troubles={troubles}
          disabled={disabled}
          onChange={setGroups}
          onRename={(key, name) => {
            const old = values.scoreGroups.find((group) => group.key === key)?.name;
            onChange({
              scoreGroups: values.scoreGroups.map((group) =>
                group.key === key ? { ...group, name } : group,
              ),
              show: old === undefined ? values.show : movedShow(values.show, old, name),
            });
          }}
          onRemove={(key) => {
            const old = values.scoreGroups.find((group) => group.key === key)?.name;
            onChange({
              scoreGroups: values.scoreGroups.filter((group) => group.key !== key),
              show: old === undefined ? values.show : withoutShow(values.show, old),
            });
          }}
          onAdd={() =>
            setGroups([
              ...values.scoreGroups,
              {
                key: freshKey('g'),
                name: `group_${String(values.scoreGroups.length + 1)}`,
                picks: {},
                none: true,
                saved: 'never',
              },
            ])
          }
        />
      </CardPart>
      <CardPart
        title="The whole result"
        line="Every value below, joined up: a wire is a value reading a group or another value. Click a value to change its line here."
      >
        {catalogue !== null && scope !== null && (
          <BoxGraph
            boxes={flowBoxes(values, rows, readings, troubles, chosen, scope)}
            wires={flowWires(values, readings)}
            selected={chosen}
            onSelect={setChosen}
            shape={SCORING}
            palette={TASK_PALETTE}
            floor={0}
            inside={(box) => {
              const value = values.scoreValues.find(
                (item) => `v:${item.key}` === box.id,
              );
              if (value === undefined || chosen !== box.id) return null;
              return (
                <FormulaLine
                  label={value.name}
                  scope={scope}
                  catalogue={catalogue}
                  value={printed(value, catalogue)}
                  autoFocus
                  marks={marksFor(errors, value.name)}
                  onFocusLine={(insert) => target.focus(value.name, insert, 'graph')}
                  onChange={(text) =>
                    setValues(
                      editText(values.scoreValues, value.key, text, catalogue, scope),
                    )
                  }
                />
              );
            }}
          />
        )}
        {target.place === 'graph' && scope !== null && catalogue !== null && (
          <FormulaTiles
            scope={scope}
            catalogue={catalogue}
            target={target.target}
            onInsert={target.insert}
          />
        )}
        <ResultParts
          values={values}
          savedShow={savedShow}
          outputs={outputs}
          files={files}
          graded={graded}
          disabled={disabled}
          onShow={setShow}
        />
      </CardPart>
      <CardPart
        title="Values"
        line="Each value is one formula. Add a value to give the submission another result."
      >
        {values.scoreValues.map((value) => {
          const reading = readings[value.key];
          const trouble = troubles.get(value.key);
          // Unread, while the blocks or the workflow are not in, it says nothing.
          const kind =
            trouble === undefined && reading === undefined
              ? null
              : trouble === undefined &&
                  reading?.unread === null &&
                  reading.problems.length === 0 &&
                  (reading.kind === 'number' || reading.kind === 'text')
                ? reading.kind
                : 'to fix';
          return (
            <div key={value.key} className={classes.valueCard}>
              <div className={classes.valueHead}>
                <FieldBox name={`value-${value.name}`}>
                  <TextInput
                    label="Name"
                    value={value.name}
                    disabled={disabled}
                    onChange={(name) => {
                      remember(value.key, value.name);
                      setValues(
                        values.scoreValues.map((item) =>
                          item.key === value.key ? { ...item, name } : item,
                        ),
                      );
                    }}
                    onCommit={() => {
                      const from = wasName[value.key];
                      if (from === undefined || catalogue === null) return;
                      const next = renamed(
                        values.scoreValues,
                        from,
                        value.name,
                        catalogue,
                      );
                      if (next === null) return;
                      setWasName((known) => {
                        const rest = { ...known };
                        delete rest[value.key];
                        return rest;
                      });
                      const show = { ...values.show };
                      const when = show[from];
                      if (when !== undefined) {
                        delete show[from];
                        show[value.name] = when;
                      }
                      onChange({
                        scoreValues: next.map((item) =>
                          item.text === '' || catalogue === null || scope === null
                            ? item
                            : {
                                ...item,
                                tree: valueTree(item, scope, catalogue),
                              },
                        ),
                        show,
                      });
                    }}
                  />
                </FieldBox>
                <WhenField
                  name={value.name}
                  when={values.show[value.name] ?? 'never'}
                  saved={value.saved}
                  graded={graded}
                  disabled={disabled}
                  labelled
                  onChange={(when) => setShow(value.name, when)}
                />
                {kind !== null && (
                  <Chip tone={kind === 'to fix' ? 'warn' : 'quiet'}>{kind}</Chip>
                )}
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      scoreValues: values.scoreValues.filter(
                        (item) => item.key !== value.key,
                      ),
                      show: withoutShow(values.show, value.name),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
              {trouble !== undefined && <BodyText>{trouble}</BodyText>}
              {catalogue !== null && scope !== null && (
                <FormulaLine
                  label={value.name}
                  scope={scope}
                  catalogue={catalogue}
                  value={printed(value, catalogue)}
                  autoFocus={value.text === '' && value.tree === null}
                  marks={marksFor(errors, value.name)}
                  onFocusLine={(insert) => target.focus(value.name, insert, value.key)}
                  onChange={(text) =>
                    setValues(
                      editText(values.scoreValues, value.key, text, catalogue, scope),
                    )
                  }
                />
              )}
              {target.place === value.key && scope !== null && catalogue !== null && (
                <FormulaTiles
                  scope={scope}
                  catalogue={catalogue}
                  target={target.target}
                  onInsert={target.insert}
                />
              )}
            </div>
          );
        })}
        <Button
          variant="secondary"
          disabled={disabled || catalogue === null}
          onClick={() =>
            setValues([
              ...values.scoreValues,
              {
                key: freshKey('v'),
                name: `value_${String(values.scoreValues.length + 1)}`,
                text: '',
                tree: null,
                saved: 'never',
              },
            ])
          }
        >
          Add a value
        </Button>
      </CardPart>
    </BuildCard>
  );
}

function example(column: Column, index: number): string {
  if (column.name === 'passed') return index % 2 === 0 ? '1' : '0';
  if (column.kind === 'text') return index % 2 === 0 ? 'accepted' : 'wrong_answer';
  return String((index + 1) * 10);
}

function editText(
  values: ScoreValue[],
  key: string,
  text: string,
  catalogue: Catalogue,
  scope: FormulaScope,
): ScoreValue[] {
  return values.map((item) =>
    item.key === key ? withLine(item, text, scope, catalogue) : item,
  );
}

function marksFor(errors: DefinitionError[], name: string) {
  const prefix = `scoring.values.${name}`;
  return errors
    .filter(
      (error) =>
        error.path === prefix ||
        error.path.startsWith(`${prefix}.`) ||
        error.path.startsWith(`${prefix}[`),
    )
    .map((error) => ({
      path: error.path
        .slice(prefix.length)
        .split(/[.[\]]+/)
        .filter((part) => part !== '')
        .map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
      message: error.message,
    }));
}

function Groups({
  rows,
  groups,
  troubles,
  disabled,
  onChange,
  onRename,
  onRemove,
  onAdd,
}: {
  rows: RunRow[];
  groups: ScoreGroup[];
  troubles: Map<string, string>;
  disabled: boolean;
  onChange: (groups: ScoreGroup[]) => void;
  onRename: (key: string, name: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  const [unpicked, setUnpicked] = useState<string | null>(null);
  return (
    <>
      {rows.length === 0 ? (
        <BodyText>No runs yet.</BodyText>
      ) : (
        <table className={classes.runs}>
          <thead>
            <tr>
              <th>Run</th>
              {groups.map((group) => (
                <th key={group.key}>
                  <FieldBox name={`group-${group.name}`}>
                    <TextInput
                      label={`Name of ${group.name}`}
                      labelHidden
                      value={group.name}
                      disabled={disabled}
                      onChange={(name) => onRename(group.key, name)}
                    />
                  </FieldBox>
                </th>
              ))}
              <th>all</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th>{row.title}</th>
                {groups.map((group) => {
                  const on = inGroup(row, group);
                  return (
                    <td key={group.key}>
                      <button
                        type="button"
                        className={classes.dot}
                        data-on={on || undefined}
                        aria-pressed={on}
                        aria-label={`${row.title} in ${group.name}`}
                        disabled={disabled}
                        onClick={() => {
                          const selected = new Set(
                            rows
                              .filter((item) => inGroup(item, group))
                              .map((item) => item.id),
                          );
                          if (selected.has(row.id)) selected.delete(row.id);
                          else selected.add(row.id);
                          const picks = pickFor(rows, selected);
                          if (picks === null) {
                            setUnpicked(group.key);
                            return;
                          }
                          setUnpicked(null);
                          onChange(
                            groups.map((item) =>
                              item.key === group.key
                                ? { ...item, picks, none: selected.size === 0 }
                                : item,
                            ),
                          );
                        }}
                      />
                    </td>
                  );
                })}
                <td>
                  <button
                    type="button"
                    className={classes.dot}
                    data-on
                    aria-pressed
                    aria-label={`${row.title} in all`}
                    disabled
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {groups.map((group) =>
        troubles.get(group.key) === undefined && unpicked !== group.key ? null : (
          <BodyText key={group.key}>
            {unpicked === group.key
              ? `${group.name} would not be one pick: a group takes every run that has the values it names.`
              : troubles.get(group.key)}
          </BodyText>
        ),
      )}
      {groups.length > 0 && (
        <div className={classes.valueHead}>
          {groups.map((group) => (
            <Button
              key={group.key}
              size="xs"
              variant="secondary"
              disabled={disabled}
              onClick={() => onRemove(group.key)}
            >
              {group.name === '' ? 'Remove this group' : `Remove ${group.name}`}
            </Button>
          ))}
        </div>
      )}
      <Button variant="secondary" disabled={disabled} onClick={onAdd}>
        Add a group
      </Button>
    </>
  );
}

function flowBoxes(
  values: TaskValues,
  rows: RunRow[],
  readings: Record<string, Reading | undefined>,
  troubles: Map<string, string>,
  chosen: string | null,
  scope: FormulaScope,
): GraphBox[] {
  const boxes: GraphBox[] = [
    {
      id: 'runs',
      title: 'Runs',
      role: 'input',
      kind: `${String(rows.length)} runs`,
      stacked: true,
      ports: [{ name: 'runs', side: 'out' }],
    },
  ];
  const groups = [...values.scoreGroups.map((group) => group.name), 'all'];
  for (const name of groups) {
    boxes.push({
      id: `g:${name}`,
      title: name,
      kind: 'group',
      stacked: true,
      ports: [
        { name: 'runs', side: 'in' },
        { name, side: 'out' },
      ],
    });
  }
  const known = new Set([
    ...values.scoreGroups.map((group) => group.name),
    'all',
    ...values.scoreValues.map((value) => value.name),
    ...FACTS.map((fact) => fact.name),
  ]);
  for (const value of values.scoreValues) {
    const reading = readings[value.key];
    const problem =
      troubles.get(value.key) ??
      reading?.unread?.message ??
      reading?.problems[0]?.message;
    const open = chosen === `v:${value.key}`;
    const sources =
      reading?.node === null || reading?.node === undefined
        ? []
        : sourcesOf(reading.node, known).filter((name) => name !== value.name);
    boxes.push({
      id: `v:${value.key}`,
      title: value.name,
      wide: 380,
      least: 2,
      kind:
        problem === undefined &&
        (reading?.kind === 'number' || reading?.kind === 'text')
          ? reading.kind
          : 'to fix',
      description: open
        ? 'Worked out as:'
        : reading?.node === null || reading?.node === undefined
          ? printed(value, null) || 'No formula yet'
          : describeFormula(reading.node, {
              ...scope,
              names: scope.names.filter((name) => name !== value.name),
            }),
      warn: open ? undefined : problem,
      ports: [
        ...sources.map((name) => ({ name, side: 'in' as const })),
        { name: value.name, side: 'out' as const },
      ],
    });
  }
  boxes.push({
    id: 'result',
    title: 'Result',
    role: 'output',
    kind: 'what it gets',
    ports: values.scoreValues.map((value) => ({
      name: value.name,
      side: 'in' as const,
    })),
  });
  return boxes;
}

function flowWires(
  values: TaskValues,
  readings: Record<string, Reading | undefined>,
): GraphWire[] {
  const wires: GraphWire[] = [];
  for (const group of [...values.scoreGroups.map((item) => item.name), 'all']) {
    wires.push({ from: 'runs', fromPort: 'runs', to: `g:${group}`, toPort: 'runs' });
  }
  const names = new Set([
    ...values.scoreGroups.map((group) => group.name),
    'all',
    ...values.scoreValues.map((item) => item.name),
    ...FACTS.map((fact) => fact.name),
  ]);
  for (const value of values.scoreValues) {
    const reading = readings[value.key];
    if (reading?.node !== null && reading?.node !== undefined) {
      for (const name of sourcesOf(reading.node, names)) {
        if (name === value.name) continue;
        const owned = values.scoreValues.find((item) => item.name === name);
        const from =
          owned !== undefined
            ? `v:${owned.key}`
            : values.scoreGroups.some((group) => group.name === name) || name === 'all'
              ? `g:${name}`
              : null;
        if (from !== null)
          wires.push({ from, fromPort: name, to: `v:${value.key}`, toPort: name });
      }
    }
    wires.push({
      from: `v:${value.key}`,
      fromPort: value.name,
      to: 'result',
      toPort: value.name,
    });
  }
  return wires;
}

function ResultParts({
  values,
  savedShow,
  outputs,
  files,
  graded,
  disabled,
  onShow,
}: {
  values: TaskValues;
  /** The when each part had when the card was read, so a shown part stays shown. */
  savedShow: Record<string, When>;
  /** The workflow's outputs, each shown with its run. */
  outputs: Column[];
  files: string[];
  graded: boolean;
  disabled: boolean;
  onShow: (name: string, when: When) => void;
}) {
  const parts = [
    ...values.scoreValues.map((value) => ({
      name: value.name,
      what: 'A value',
      saved: value.saved,
    })),
    ...values.scoreGroups.map((group) => ({
      name: group.name,
      what: 'Its runs',
      saved: group.saved,
    })),
    { name: 'all', what: 'Every run', saved: savedShow.all ?? 'never' },
    {
      name: 'compiled',
      what: 'Whether it compiled',
      saved: savedShow.compiled ?? 'never',
    },
    ...outputs.map((output) => ({
      name: output.name,
      what: output.title ?? 'An output of each run',
      saved: savedShow[output.name] ?? 'never',
    })),
    ...files.map((file) => ({
      name: file,
      what: 'A file, to download',
      saved: savedShow[file] ?? 'never',
    })),
  ];
  // A name the file shows that is no part of the task, such as a value since
  // removed: the forge refuses it, so it is listed to take out.
  const known = new Set(parts.map((part) => part.name));
  const unknown = Object.entries(values.show)
    .filter(([name, when]) => when !== 'never' && name !== '' && !known.has(name))
    .map(([name]) => name);
  return (
    <table className={classes.runs}>
      <thead>
        <tr>
          <th>Name</th>
          <th>What it is</th>
          <th>Shown</th>
        </tr>
      </thead>
      <tbody>
        {parts
          .filter((part) => part.name !== '')
          .map((part) => (
            <tr key={`${part.what}:${part.name}`}>
              <th>{part.name}</th>
              <td>{part.what}</td>
              <td>
                <WhenField
                  name={part.name}
                  when={values.show[part.name] ?? 'never'}
                  saved={part.saved}
                  graded={graded}
                  disabled={disabled}
                  onChange={(when) => onShow(part.name, when)}
                />
              </td>
            </tr>
          ))}
        {unknown.map((name) => (
          <tr key={`unknown:${name}`}>
            <th>{name}</th>
            <td>Not a part of this task, so the save is refused</td>
            <td>
              <Button
                size="xs"
                variant="secondary"
                disabled={disabled}
                onClick={() => onShow(name, 'never')}
              >
                {`Stop showing ${name}`}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `show` without `name`, as when the part it names is removed. */
function withoutShow(show: Record<string, When>, name: string): Record<string, When> {
  const rest = { ...show };
  delete rest[name];
  return rest;
}

/** `show` with `from`'s when moved to `to`, as when the part is renamed. */
function movedShow(
  show: Record<string, When>,
  from: string,
  to: string,
): Record<string, When> {
  const when = show[from];
  if (when === undefined || from === to) return show;
  const rest = withoutShow(show, from);
  rest[to] = when;
  return rest;
}

function WhenField({
  name,
  when,
  saved,
  graded,
  disabled,
  labelled = false,
  onChange,
}: {
  name: string;
  when: When;
  saved: When;
  graded: boolean;
  disabled: boolean;
  labelled?: boolean;
  onChange: (when: When) => void;
}) {
  const seen = graded && saved === 'now';
  return (
    <Select
      label={labelled ? 'Shown to entrants' : `When ${name} is shown`}
      labelHidden={!labelled}
      value={when}
      disabled={disabled}
      options={WHEN.map((item, index) => ({
        value: item.value,
        label:
          seen && index > 0 ? `${item.label}: no, entrants have seen it` : item.label,
        disabled: seen && index > 0,
      }))}
      onChange={(next) => onChange(next as When)}
    />
  );
}
