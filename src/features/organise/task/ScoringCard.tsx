import { boxOptions, parseUse } from '../workflows/boxes';
import { sourcesOf } from '../formula/flow';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { listed } from '@/lib/listed';
import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Select } from '@/ui/Select';
import { IconButton } from '@/ui/IconButton';
import { Checkbox } from '@/ui/Checkbox';
import { TextInput } from '@/ui/TextInput';
import { FormulaCard } from '../formula/FormulaCard';
import { Card } from '@/ui/Card';
import type { FlowAbout } from '../formula/flow';
import { BLOCKS_UNLOADED, type Catalogue } from '../formula/catalogue';
import {
  describeFormula,
  readLine,
  sameTree,
  type FormulaScope,
  type Reading,
} from '../formula/parse';
import { treeQuery } from '../files/place';
import { FieldBox } from '../contest/ContestFile';
import type { TaskValues, AxisValues } from '../forms/task-values';
import { BuildCard, CardPart } from './BuildCard';
import type { TaskPlace } from './build-data';
import { BoxGraph } from '../flow/BoxGraph';
import {
  TASK_PALETTE,
  RESULT_ROW,
  type GraphBox,
  type GraphWire,
  type GraphPort,
  type Shape,
} from '../flow/graph';
import {
  FACTS,
  WHEN,
  axisColumns,
  columnsOf,
  freshKey,
  inGroup,
  outputColumns,
  ticksOf,
  withTick,
  runName,
  printed,
  renamed,
  ONE_RUN,
  submissionRuns,
  scopeOf,
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

const SCORING: Shape = { width: 160, gap: 40 };

/**
 * When entrants see whether it compiled while `show` does not list it: once
 * any of its runs is shown, as the runs' verdicts already tell it.
 */
const ONCE_A_RUN_IS_SHOWN = 'Once any run is shown';

/** What pages call the fact that a submission compiled. */
const COMPILED = FACTS.find((fact) => fact.name === 'compiled')?.title ?? 'compiled';

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
  titles,
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
  /** Each input's title from the workflow, by its name. */
  titles: ReadonlyMap<string, string>;
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
  const ref = parseUse(values.workflow.trim());
  const outputTypes = useQuery({
    ...boxOptions(ref ?? { owner: '', name: '', version: '' }),
    enabled: ref !== null,
    retry: false,
  });
  const textOutputs = useMemo(
    () =>
      (outputTypes.data?.outputs ?? [])
        .filter(
          (output) =>
            output.type === 'text' ||
            output.type === 'file' ||
            output.type === 'folder',
        )
        .map((output) => output.name),
    [outputTypes.data],
  );
  const outputs = useMemo(
    () => outputColumns(workflowText, textOutputs),
    [workflowText, textOutputs],
  );
  const columns = useMemo(() => columnsOf(outputs), [outputs]);
  // A formula also reads each input an axis fills, as a column of its run.
  const repeated = useMemo(
    () => axisColumns(values.axes, values.inputs),
    [values.axes, values.inputs],
  );
  const readable = useMemo(() => [...columns, ...repeated], [columns, repeated]);
  const rows = useMemo(() => submissionRuns(values.axes), [values.axes]);
  // What a run gives that the table above does not show: each input a table
  // repeats, or every column while there is no table.
  const also = rows.length === 0 ? readable : repeated;
  const [chosen, setChosen] = useState<string | null>(null);
  // The when as read. A part shown now stays shown, even after the select moves.
  const [savedShow] = useState(values.show);
  const [wasName, setWasName] = useState<Record<string, string>>({});
  const remember = (key: string, name: string) =>
    setWasName((known) => (key in known ? known : { ...known, [key]: name }));
  const scope = useMemo(
    () =>
      catalogue === null || workflowRead !== 'ready' || outputTypes.data === undefined
        ? null
        : {
            ...scopeOf(values.scoreGroups, values.scoreValues, readable, catalogue),
            members: Object.fromEntries([
              ...values.scoreGroups.map(
                (group) =>
                  [
                    group.name,
                    rows.filter((row) => inGroup(row, group)).map((row) => row.title),
                  ] as const,
              ),
              ['all', rows.map((row) => row.title)],
            ]),
          },
    [
      catalogue,
      readable,
      rows,
      values.scoreGroups,
      values.scoreValues,
      workflowRead,
      outputTypes.data,
    ],
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
  const troubles = troublesOf(values.scoreGroups, values.scoreValues, readings, rows);
  const blocked = [
    ...troubles.values(),
    ...values.scoreValues.flatMap((value) => {
      const reading = readings[value.key];
      if (reading === undefined) return [];
      // A line not edited saves the tree it was printed from. When the print
      // does not read back to that tree, the reading is not what is saved:
      // the forge checks the stored tree at the save.
      if (value.text === '' && !sameTree(reading.tree, value.tree)) return [];
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

  const flowNames = new Map<string, Omit<FlowAbout, 'name'>>([
    ...values.scoreGroups.map(
      (group) =>
        [
          group.name,
          {
            kind: 'group',
            description: rows
              .filter((row) => inGroup(row, group))
              .map((row) => row.title)
              .join(', '),
          },
        ] as const,
    ),
    ['all', { kind: 'group', description: rows.map((row) => row.title).join(', ') }],
    ...values.scoreValues.map((value) => {
      const node = readings[value.key]?.node;
      return [
        value.name,
        {
          kind: 'value',
          description:
            node == null || scope === null
              ? printed(value, catalogue)
              : describeFormula(node, scope),
        },
      ] as const;
    }),
    ...FACTS.map(
      (fact) => [fact.name, { kind: 'fact', description: fact.line }] as const,
    ),
  ]);
  const navigate = (id: string | null) => {
    setChosen(id);
    if (id === null) return;
    const element = document.getElementById(
      id === 'runs'
        ? 'runs'
        : id.startsWith('v:')
          ? `value-${id.slice(2)}`
          : `group-${id.slice(2)}`,
    );
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (id.startsWith('v:'))
      element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  };
  return (
    <BuildCard
      id="scoring"
      title="Scoring"
      line="How a submission's runs become its result: which runs count together, and the numbers worked out from them."
    >
      {blocks.isError && <BodyText>{BLOCKS_UNLOADED}</BodyText>}
      {(workflowRead === 'failed' || outputTypes.isError) && (
        <BodyText>{WORKFLOW_UNREAD}</BodyText>
      )}
      <CardPart
        title="What one submission gives"
        line="One submission runs once on each row. The numbers here are made up, to show the shape."
      >
        {rows.length === 0 ? (
          <BodyText>
            No runs yet, so a submission gives nothing until the runs have a row.
          </BodyText>
        ) : (
          <div className={classes.runTableFrame}>
            <table className={classes.runs} aria-label="What one submission gives">
              <thead>
                <tr>
                  <th>Run</th>
                  {columns.map((column) => (
                    <th key={column.name}>
                      {column.title ?? column.name}
                      <div className={classes.columnKind}>
                        {column.kind}
                        {column.unit === null ? '' : ` · ${column.unit}`}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <th>{row.title}</th>
                    {columns.map((column, at) => (
                      <td key={column.name}>{example(column, index, at)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <BodyText size="sm">
          {also.length > 0 &&
            `Every run also gives ${listed(also.map((column) => column.title ?? titles.get(column.name) ?? column.name))}. `}
          A value can also read {listed(FACTS.map((fact) => fact.title.toLowerCase()))}.
        </BodyText>
      </CardPart>
      <CardPart
        title="Groups"
        line="Named sets of runs that a value can add up together, such as the small tests. all is every run."
      >
        <Groups
          marked={chosen?.startsWith('g:') ? chosen.slice(2) : null}
          rows={rows}
          tables={values.axes}
          show={values.show}
          savedShow={savedShow}
          graded={graded}
          onShow={setShow}
          groups={values.scoreGroups}
          troubles={troubles}
          disabled={disabled}
          onChange={setGroups}
          onRename={(key, name) => {
            const old = values.scoreGroups.find((group) => group.key === key)?.name;
            if (old !== undefined) remember(key, old);
            setGroups(
              values.scoreGroups.map((group) =>
                group.key === key ? { ...group, name } : group,
              ),
            );
          }}
          onRenamed={(key) => {
            // The when moves once the name is done, to a name nothing else
            // has: one typed through on the way never takes another's.
            const from = wasName[key];
            const to = values.scoreGroups.find((group) => group.key === key)?.name;
            if (from === undefined || to === undefined || to.trim() === '') return;
            const taken =
              values.scoreGroups.some(
                (group) => group.key !== key && group.name === to,
              ) || values.scoreValues.some((value) => value.name === to);
            if (taken) return;
            setWasName((known) => {
              const rest = { ...known };
              delete rest[key];
              return rest;
            });
            onChange({ show: movedShow(values.show, from, to) });
          }}
          onRemove={(key) => {
            const old =
              wasName[key] ??
              values.scoreGroups.find((group) => group.key === key)?.name;
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
        line="Every value below, joined up: a wire is a value reading a group or another value. Click a value for its card, or a group for its column."
      >
        {catalogue !== null && scope !== null && (
          <div className={classes.resultFlow}>
            <BoxGraph
              boxes={flowBoxes({
                values,
                rows,
                readings,
                troubles,
                scope,
                outputs,
                files,
                columns,
              })}
              wires={flowWires(values, readings)}
              selected={chosen}
              onSelect={navigate}
              expand={false}
              shape={SCORING}
              palette={TASK_PALETTE}
              floor={0}
              inside={() => null}
            />
          </div>
        )}
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
            printed(value, catalogue).trim() === ''
              ? 'empty'
              : trouble === undefined && reading === undefined
                ? null
                : trouble === undefined &&
                    reading?.unread === null &&
                    reading.problems.length === 0 &&
                    (reading.kind === 'number' || reading.kind === 'text')
                  ? reading.kind
                  : 'to fix';
          const head = (
            <div className={classes.valueHead}>
              <FieldBox name={`value-${value.name}`}>
                <TextInput
                  label="Name"
                  width="lg"
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
              <span className={classes.formulaGap} />
              {!disabled && (
                <IconButton
                  sign="✕"
                  label={`Remove ${value.name}`}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      scoreValues: values.scoreValues.filter(
                        (item) => item.key !== value.key,
                      ),
                      show: withoutShow(values.show, value.name),
                    })
                  }
                />
              )}
            </div>
          );
          return (
            <div
              key={value.key}
              id={`value-${value.key}`}
              role="group"
              aria-label={`Value ${value.name}`}
              className={classes.valueCard}
            >
              {catalogue !== null && scope !== null ? (
                <FormulaCard
                  disabled={disabled}
                  head={head}
                  name={value.name}
                  names={flowNames}
                  label={value.name}
                  scope={scope}
                  catalogue={catalogue}
                  value={printed(value, catalogue)}
                  autoFocus={value.text === '' && value.tree === null}
                  marks={marksFor(errors, value.name)}
                  trouble={trouble}
                  onChange={(text) =>
                    setValues(
                      editText(values.scoreValues, value.key, text, catalogue, scope),
                    )
                  }
                />
              ) : (
                <Card>
                  {head}
                  {trouble !== undefined && <BodyText>{trouble}</BodyText>}
                </Card>
              )}
            </div>
          );
        })}
        <div className={classes.ownWidth}>
          {!disabled && (
            <Button
              variant="secondary"
              disabled={disabled || catalogue === null}
              onClick={() => {
                const taken = new Set([
                  ...values.scoreValues.map((value) => value.name),
                  ...values.scoreGroups.map((group) => group.name),
                  ...FACTS.map((fact) => fact.name),
                  'all',
                ]);
                let index = values.scoreValues.length + 1;
                while (taken.has(`value_${String(index)}`)) index += 1;
                setValues([
                  ...values.scoreValues,
                  {
                    key: freshKey('v'),
                    name: `value_${String(index)}`,
                    text: '',
                    tree: null,
                    saved: 'never',
                  },
                ]);
              }}
            >
              Add a value
            </Button>
          )}
        </div>
      </CardPart>
      <CardPart
        title="Also shown to entrants"
        line="A run’s reports already show with its group. These show on their own."
      >
        <OtherShown
          values={values}
          savedShow={savedShow}
          outputs={outputs}
          files={files}
          graded={graded}
          disabled={disabled}
          onShow={setShow}
        />
      </CardPart>
    </BuildCard>
  );
}

function example(column: Column, index: number, at: number): string {
  if (column.name === 'passed') return index % 2 === 0 ? '1' : '0';
  if (column.name === 'verdict') return index % 2 === 0 ? 'accepted' : 'wrong_answer';
  if (column.kind === 'text') return 'text';
  return String((index + 1) * (at + 1) * 10);
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
  marked,
  rows,
  tables: given,
  groups,
  show,
  savedShow,
  graded,
  troubles,
  disabled,
  onShow,
  onChange,
  onRename,
  onRenamed,
  onRemove,
  onAdd,
}: {
  marked: string | null;
  rows: RunRow[];
  tables: AxisValues[];
  groups: ScoreGroup[];
  show: Record<string, When>;
  savedShow: Record<string, When>;
  graded: boolean;
  troubles: Map<string, string>;
  disabled: boolean;
  onShow: (name: string, when: When) => void;
  onChange: (groups: ScoreGroup[]) => void;
  onRename: (key: string, name: string) => void;
  onRenamed: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  // A table whose inputs have all gone makes no run, as on the Runs card.
  const tables = given.filter((table) => table.inputs.length > 0);
  return (
    <>
      <div className={classes.groupFrame}>
        <table className={classes.groupGrid} aria-label="Groups">
          <thead>
            <tr>
              <th>Run</th>
              {groups.map((group) => (
                <th
                  key={group.key}
                  id={`group-${group.name}`}
                  data-marked={marked === group.name || undefined}
                >
                  <div className={classes.groupHead}>
                    <FieldBox name={`group-${group.name}`}>
                      <TextInput
                        label={`Name of ${group.name}`}
                        labelHidden
                        value={group.name}
                        disabled={disabled}
                        onChange={(name) => onRename(group.key, name)}
                        onCommit={() => onRenamed(group.key)}
                      />
                    </FieldBox>
                    {!disabled && (
                      <IconButton
                        sign="✕"
                        label={`Remove group ${group.name}`}
                        disabled={disabled}
                        onClick={() => onRemove(group.key)}
                      />
                    )}
                  </div>
                  {troubles.get(group.key) !== undefined && (
                    <BodyText tone="secondary">{troubles.get(group.key)}</BodyText>
                  )}
                </th>
              ))}
              <th id="group-all" data-marked={marked === 'all' || undefined}>
                all<BodyText size="sm">every run</BodyText>
              </th>
            </tr>
            <tr>
              <th>Shown to entrants</th>
              {groups.map((group) => (
                <td key={group.key}>
                  <WhenField
                    name={group.name}
                    when={show[group.name] ?? 'never'}
                    saved={group.saved}
                    graded={graded}
                    disabled={disabled}
                    onChange={(when) => onShow(group.name, when)}
                  />
                </td>
              ))}
              <td>
                <WhenField
                  name="all"
                  when={show.all ?? 'never'}
                  saved={savedShow.all ?? 'never'}
                  graded={graded}
                  disabled={disabled}
                  onChange={(when) => onShow('all', when)}
                />
              </td>
            </tr>
          </thead>
          {tables.length === 0 && (
            <tbody>
              <tr>
                <th>{ONE_RUN}</th>
                {groups.map((group) => (
                  <td key={group.key} />
                ))}
                <td aria-label={`${ONE_RUN} in all`}>✓</td>
              </tr>
            </tbody>
          )}
          {tables.map((table, tableIndex) => (
            <tbody key={tableIndex}>
              {tables.length > 1 && (
                <tr>
                  <th colSpan={groups.length + 2}>{table.inputs.join(', ')}</th>
                </tr>
              )}
              {table.tuples.map((tuple, index) => {
                const name = runName(tuple, [table]);
                return (
                  <tr key={index}>
                    <th>{name}</th>
                    {groups.map((group) => (
                      <td key={group.key}>
                        <Checkbox
                          label={`${name} in ${group.name}`}
                          labelHidden
                          checked={ticksOf(group, [table])[0]?.[index] ?? false}
                          disabled={disabled}
                          onChange={(checked) =>
                            onChange(
                              groups.map((item) =>
                                item.key === group.key
                                  ? withTick(item, table, index, checked, rows)
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td aria-label={`${name} in all`}>✓</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <th />
              {groups.map((group) => {
                const count = rows.filter((row) => inGroup(row, group)).length;
                return (
                  <td key={group.key} data-empty={count === 0 || undefined}>
                    {count === 0
                      ? 'No runs'
                      : `${String(count)} ${count === 1 ? 'run' : 'runs'}`}
                  </td>
                );
              })}
              <td>
                {tables.length > 1
                  ? `${tables.map((table) => table.tuples.length).join(' × ')} = `
                  : ''}
                {runCount(rows.length)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {tables.length > 1 && (
        <BodyText size="sm">A tick picks that row in every run.</BodyText>
      )}
      <div className={classes.ownWidth}>
        {!disabled && (
          <Button variant="secondary" disabled={disabled} onClick={onAdd}>
            Add a group
          </Button>
        )}
      </div>
    </>
  );
}

function flowBoxes({
  values,
  rows,
  readings,
  troubles,
  scope,
  outputs,
  files,
  columns,
}: {
  values: TaskValues;
  rows: RunRow[];
  readings: Record<string, Reading | undefined>;
  troubles: Map<string, string>;
  scope: FormulaScope;
  outputs: Column[];
  files: string[];
  columns: Column[];
}): GraphBox[] {
  const boxes: GraphBox[] = [
    {
      id: 'runs',
      title: 'Runs',
      role: 'input',
      kind: runCount(rows.length),
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
    const sources =
      reading?.node === null || reading?.node === undefined
        ? []
        : sourcesOf(reading.node, known).filter((name) => name !== value.name);
    boxes.push({
      id: `v:${value.key}`,
      title: value.name,
      least: 2,
      kind:
        problem === undefined &&
        (reading?.kind === 'number' || reading?.kind === 'text')
          ? reading.kind
          : 'to fix',
      description:
        reading?.node === null || reading?.node === undefined
          ? printed(value, null) || 'No formula yet'
          : describeFormula(reading.node, {
              ...scope,
              names: scope.names.filter((name) => name !== value.name),
            }),
      warn: problem,
      ports: [
        ...sources.map((name) => ({ name, side: 'in' as const })),
        { name: value.name, side: 'out' as const },
      ],
    });
  }
  const when = (name: string) => {
    const value = values.show[name] ?? 'never';
    return WHEN.find((option) => option.value === value)?.label ?? 'Not shown';
  };
  const parts = columns.map(
    (column) =>
      `${column.title ?? column.name}${column.unit === null ? '' : ` (${column.unit})`}`,
  );
  const shown = (name: string): GraphPort['shown'] => {
    const value = values.show[name] ?? 'never';
    return value === 'never' ? 'never' : value === 'now' ? 'now' : 'later';
  };
  const fileNames = [
    ...files,
    ...Object.keys(values.show).filter(
      (name) => name.endsWith('/') && !files.includes(name),
    ),
  ];
  // Each kind of part under its heading, a heading only over parts there
  // are; the first names the columns.
  const sections: { key: string; label: string; parts: GraphPort[] }[] = [
    {
      key: 'values',
      label: 'Values',
      parts: values.scoreValues.map((value) => ({
        name: `value:${value.name}`,
        label: value.name,
        side: 'in' as const,
        kind: readings[value.key]?.kind ?? 'to fix',
        when: when(value.name),
        shown: shown(value.name),
      })),
    },
    {
      key: 'groups',
      label: 'Groups',
      parts: [
        ...values.scoreGroups,
        { key: 'all', name: 'all', picks: {}, none: false, saved: 'never' as const },
      ].map((group) => ({
        name: `group:${group.name}`,
        label: group.name,
        side: 'in' as const,
        kind: runCount(rows.filter((row) => inGroup(row, group)).length),
        when: when(group.name),
        shown: shown(group.name),
        rows: tagRows(parts),
        parts,
      })),
    },
    {
      key: 'own',
      label: 'On its own',
      parts: [
        ...outputs.map((output) => ({
          name: `output:${output.name}`,
          label: `${output.title ?? output.name}${output.unit === null ? '' : ` (${output.unit})`}`,
          side: 'in' as const,
          pin: false,
          kind: output.kind,
          when: when(output.name),
          shown: shown(output.name),
        })),
        {
          name: 'fact:compiled',
          label: COMPILED,
          side: 'in',
          pin: false,
          when:
            values.show.compiled && values.show.compiled !== 'never'
              ? when('compiled')
              : ONCE_A_RUN_IS_SHOWN,
          shown:
            values.show.compiled && values.show.compiled !== 'never'
              ? shown('compiled')
              : 'later',
        },
      ],
    },
    {
      key: 'files',
      label: 'Files to download',
      parts: fileNames.map((file) => ({
        name: `file:${file}`,
        label: file,
        side: 'in' as const,
        pin: false,
        when: when(file),
        shown: shown(file),
      })),
    },
  ];
  const ports: GraphPort[] = [
    ...sections
      .filter((section) => section.parts.length > 0)
      .flatMap((section, index): GraphPort[] => [
        {
          name: `heading:${section.key}`,
          label: section.label,
          side: 'in',
          heading: true,
          ...(index === 0 ? { kind: 'Kind', when: 'Shown' } : {}),
        },
        ...section.parts,
      ]),
    {
      name: 'footer',
      label: '',
      detail: 'Organisers and leaderboards can still read parts marked Not shown.',
      side: 'in',
      pin: false,
      rows: 2,
    },
  ];
  boxes.push({
    id: 'result',
    title: 'Result',
    role: 'output',
    kind: 'what the entrant gets',
    description: 'Each part of the result, and when the entrant sees it.',
    wide: 320,
    alwaysOpen: true,
    rowHeight: RESULT_ROW,
    ports,
  });
  return boxes;
}

function runCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'run' : 'runs'}`;
}

/**
 * How many Result rows a row with these tags takes: its line, then the tags
 * packed into lines across the box, about 5.6 px a letter at their size,
 * at most three lines: past that the tags scroll inside the row.
 */
function tagRows(parts: string[]): number {
  const room = 320 - 2 - 20;
  let lines = parts.length > 0 ? 1 : 0;
  let used = 0;
  for (const part of parts) {
    const width = part.length * 5.6 + 12;
    if (used > 0 && used + 4 + width > room) {
      lines += 1;
      used = width;
    } else used += (used > 0 ? 4 : 0) + width;
  }
  lines = Math.min(lines, 3);
  const height = 8 + 20 + (lines > 0 ? 4 + lines * 16 + (lines - 1) * 4 : 0);
  return Math.max(1, Math.ceil(height / RESULT_ROW));
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
      toPort: `value:${value.name}`,
    });
  }
  for (const group of [...values.scoreGroups.map((group) => group.name), 'all']) {
    wires.push({
      from: `g:${group}`,
      fromPort: group,
      to: 'result',
      toPort: `group:${group}`,
    });
  }
  return wires;
}

function OtherShown({
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
    {
      name: 'compiled',
      label: COMPILED,
      what: 'on its own',
      saved: savedShow.compiled ?? 'never',
      unlisted: ONCE_A_RUN_IS_SHOWN,
    },
    ...outputs.map((output) => ({
      name: output.name,
      label: `${output.title ?? output.name}${output.unit === null ? '' : ` (${output.unit})`}`,
      what: 'on its own',
      saved: savedShow[output.name] ?? 'never',
    })),
    ...files.map((file) => ({
      name: file,
      label: file,
      what: 'to download',
      saved: savedShow[file] ?? 'never',
    })),
    // A listed folder may be empty (open 73), as the starter's `public/` is
    // before it holds a picture; the tree has no entry for it, and the forge
    // takes it.
    ...Object.keys(values.show)
      .filter((name) => name.endsWith('/') && !files.includes(name))
      .map((name) => ({
        name,
        label: name,
        what: 'A folder, empty for now',
        saved: savedShow[name] ?? 'never',
      })),
  ];
  // A name the file shows that is no part of the task, such as a value since
  // removed: the forge refuses it, so it is listed to take out.
  const known = new Set([
    ...parts.map((part) => part.name),
    ...values.scoreGroups.map((group) => group.name),
    ...values.scoreValues.map((value) => value.name),
    'all',
  ]);
  const unknown = Object.entries(values.show)
    .filter(([name, when]) => when !== 'never' && name !== '' && !known.has(name))
    .map(([name]) => name);
  return (
    <table className={classes.runs}>
      <tbody>
        {parts
          .filter((part) => part.name !== '')
          .map((part) => (
            <tr key={`${part.what}:${part.name}`}>
              <th>{part.label}</th>
              <td>{part.what}</td>
              <td>
                <WhenField
                  name={part.name}
                  when={values.show[part.name] ?? 'never'}
                  saved={part.saved}
                  graded={graded}
                  disabled={disabled}
                  unlisted={'unlisted' in part ? part.unlisted : undefined}
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
              {!disabled && (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => onShow(name, 'never')}
                >
                  {`Stop showing ${name}`}
                </Button>
              )}
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
  unlisted,
  onChange,
}: {
  name: string;
  when: When;
  saved: When;
  graded: boolean;
  disabled: boolean;
  labelled?: boolean;
  /** What a part `show` does not list is said as, where it is not simply not shown. */
  unlisted?: string;
  onChange: (when: When) => void;
}) {
  const seen = graded && saved === 'now';
  return (
    <div data-show-part={name}>
      <Select
        label={labelled ? 'Shown to entrants' : `When ${name} is shown`}
        width="sm"
        labelHidden={!labelled}
        value={when}
        disabled={disabled}
        options={WHEN.map((item, index) => {
          const label =
            item.value === 'never' && unlisted !== undefined ? unlisted : item.label;
          return {
            value: item.value,
            label: seen && index > 0 ? `${label}: no, entrants have seen it` : label,
            disabled: seen && index > 0,
          };
        })}
        onChange={(next) => onChange(next as When)}
      />
    </div>
  );
}
