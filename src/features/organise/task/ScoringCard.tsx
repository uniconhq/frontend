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
import { FieldBox } from '../contest/ContestFile';
import type { BoxOutput } from '@/api/types';
import type { TaskValues, AxisValues } from '../forms/task-values';
import { BuildCard, CardPart } from './BuildCard';
import type { TaskPlace } from './build-data';
import { CardGraph } from '../flow/CardGraph';
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
  MOMENTS,
  axisColumns,
  columnsOf,
  freshKey,
  inGroup,
  momentsOf,
  outputColumns,
  perRunEntrant,
  renamedInShow,
  runEntries,
  ticksOf,
  withTick,
  runName,
  printed,
  renamed,
  ONE_RUN,
  scopeOf,
  showTroublesOf,
  troublesOf,
  valueTree,
  withLine,
  withoutInShow,
  type Column,
  type Moment,
  type DraftRunRows,
  type RunRow,
  type ScoreGroup,
  type ScoreValue,
  type Show,
} from './scoring-model';
import { ShowPicker, type ShowRow } from './ShowPicker';
import { ShowPreview } from './ShowPreview';
import { useDraftRuns } from './draft-runs';
import { FIRST_NOT_PASSED } from '@/ui/scored/scored-text';
import { Group } from '@/ui/layout';
import { isUnder } from '../problem-path';
import tableClasses from '@/ui/table.module.css';
import classes from './task.module.css';

const SCORING: Shape = { width: 160, gap: 40 };

/** What pages call the fact that a submission compiled. */
const COMPILED = FACTS.find((fact) => fact.name === 'compiled')?.title ?? 'compiled';

/** What every run gives beside its own inputs and outputs, as `show` names it. */
const RUN_FIELDS: ShowRow[] = [
  { name: 'verdict', label: 'Verdict' },
  { name: 'passed', label: 'Passed' },
  { name: 'label', label: 'Label' },
  { name: 'message', label: 'Message' },
];

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
  elsewhere,
  values,
  titles,
  workflowValues,
  workflowRead,
  graded,
  disabled,
  errors,
  sentShow,
  onChange,
  onProblems,
}: {
  place: TaskPlace;
  /** The draft changes more than show, so the preview says to publish first. */
  elsewhere: boolean;
  values: TaskValues;
  /** Each input's title from the workflow, by its name. */
  titles: ReadonlyMap<string, string>;
  /** The workflow's values, so the runs' columns are its outputs. */
  workflowValues: unknown;
  /** Until it reads, a formula is not checked, so no output is called unknown. */
  workflowRead: WorkflowRead;
  /** A graded submission exists, so what is shown always has been seen. */
  graded: boolean;
  disabled: boolean;
  /** What the forge said of the last save, each at its path. */
  errors: DefinitionError[];
  /** `show` as the last save sent it, which the errors' paths count in. */
  sentShow: Show;
  onChange: (change: Partial<TaskValues>) => void;
  /** What stops the save: a formula line that does not read. */
  onProblems: (problems: string[]) => void;
}) {
  const blocks = $api.useQuery('get', '/api/v1/blocks');
  const catalogue = blocks.data ?? null;
  const ref = parseUse(values.workflow.trim());
  // The task's repeated inputs, so the box says which outputs are given once.
  const repeatedNames = values.axes.flatMap((axis) => axis.inputs);
  const outputTypes = useQuery({
    ...boxOptions(ref ?? { owner: '', name: '', version: '' }, repeatedNames),
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
    () => outputColumns(workflowValues, textOutputs),
    [workflowValues, textOutputs],
  );
  const columns = useMemo(() => columnsOf(outputs), [outputs]);
  // A formula also reads each input an axis fills, as a column of its run.
  const repeated = useMemo(
    () => axisColumns(values.axes, values.inputs),
    [values.axes, values.inputs],
  );
  const readable = useMemo(() => [...columns, ...repeated], [columns, repeated]);
  const draft = useDraftRuns(place, values.axes, values.inputs);
  const rows = useMemo(() => draft.runs?.runs ?? [], [draft.runs]);
  // What a run gives that the table above does not show: each input a table
  // repeats, or every column while there is no table.
  const also = draft.runs === null ? [] : rows.length === 0 ? readable : repeated;
  const [chosen, setChosen] = useState<string | null>(null);
  // `show` as read, so hiding what was shown always is warned of.
  const [savedShow] = useState(values.show);
  const [wasName, setWasName] = useState<Record<string, string>>({});
  const remember = (key: string, name: string) =>
    setWasName((known) => (key in known ? known : { ...known, [key]: name }));
  const scope = useMemo(
    () =>
      catalogue === null ||
      workflowRead !== 'ready' ||
      outputTypes.data === undefined ||
      draft.runs === null
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
      draft.runs,
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
  const troubles = troublesOf(values.scoreGroups, values.scoreValues, errors);
  const blocked = [
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
  const shown = showRows(values, titles, outputTypes.data?.outputs, repeatedNames);

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
        {draft.failed && draft.runs === null ? (
          <BodyText>The runs could not be read.</BodyText>
        ) : draft.runs === null ? null : draft.runs.count > rows.length ? (
          <BodyText>{`The runs make ${String(draft.runs.count)} runs, too many to list.`}</BodyText>
        ) : rows.length === 0 ? (
          <BodyText>
            No runs yet, so a submission gives nothing until the runs have a row.
          </BodyText>
        ) : (
          <div className={tableClasses.scroll}>
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
          runs={draft.runs}
          tables={values.axes}
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
            // Its runs' entries in show move once the name is done, to a name
            // nothing else has: one typed through on the way never takes another's.
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
            onChange({ show: renamedInShow(values.show, 'runs', from, to) });
          }}
          onRemove={(key) => {
            const old =
              wasName[key] ??
              values.scoreGroups.find((group) => group.key === key)?.name;
            onChange({
              scoreGroups: values.scoreGroups.filter((group) => group.key !== key),
              show:
                old === undefined
                  ? values.show
                  : withoutInShow(values.show, 'runs', old),
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
            <CardGraph
              boxes={flowBoxes({
                values,
                rows,
                readings,
                troubles,
                scope,
                columns,
                shown,
              })}
              wires={flowWires(values, readings)}
              selected={chosen}
              onSelect={navigate}
              shape={SCORING}
              palette={TASK_PALETTE}
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
            <Group gap={8} align="end">
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
                    const show = renamedInShow(values.show, 'values', from, value.name);
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
                      show: withoutInShow(values.show, 'values', value.name),
                    })
                  }
                />
              )}
            </Group>
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
        title="What entrants see"
        line="Nothing is shown unless it is turned on here. Always shows it at both later moments too. After the deadline and After release are separate, and either can come first."
      >
        <ShowPicker
          show={values.show}
          saved={savedShow}
          graded={graded}
          disabled={disabled}
          values={shown.values}
          settings={shown.settings}
          outputs={shown.outputs}
          fields={shown.fields}
          groups={values.scoreGroups}
          runs={rows}
          troubles={showTroublesOf(sentShow, errors)}
          onChange={(show) => onChange({ show })}
        />
      </CardPart>
      <CardPart
        title="Preview"
        line="An entrant's page as the grid leaves it, at the moment picked, before any submission or with one of theirs."
      >
        <ShowPreview place={place} show={values.show} elsewhere={elsewhere} />
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
  const top = ['scoring', 'values', name];
  return errors
    .filter((error) => isUnder(error.path, top))
    .map((error) => ({ path: error.path.slice(top.length), message: error.message }));
}

function Groups({
  marked,
  runs,
  tables: given,
  groups,
  troubles,
  disabled,
  onChange,
  onRename,
  onRenamed,
  onRemove,
  onAdd,
}: {
  marked: string | null;
  /** The server's runs, null until they load. */
  runs: DraftRunRows | null;
  tables: AxisValues[];
  groups: ScoreGroup[];
  troubles: Map<string, string>;
  disabled: boolean;
  onChange: (groups: ScoreGroup[]) => void;
  onRename: (key: string, name: string) => void;
  onRenamed: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  // A table whose inputs have all gone makes no run, as on the Runs card.
  const tables = given.filter((table) => table.inputs.length > 0);
  const rows = runs?.runs ?? [];
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
                const axis = {
                  inputs: table.inputs,
                  rows: runs?.axes[tableIndex] ?? [],
                };
                // Ticks wait until the server's rows match the table's.
                const settled = axis.rows.length === table.tuples.length;
                return (
                  <tr key={index}>
                    <th>{name}</th>
                    {groups.map((group) => (
                      <td key={group.key}>
                        <Checkbox
                          label={`${name} in ${group.name}`}
                          labelHidden
                          checked={settled && (ticksOf(group, axis)[index] ?? false)}
                          disabled={disabled || !settled}
                          onChange={(checked) =>
                            onChange(
                              groups.map((item) =>
                                item.key === group.key
                                  ? withTick(item, axis, index, checked, rows)
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
                {runCount(runs?.count ?? rows.length)}
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

/** What the grid has a row for, section by section, from the task and its workflow. */
function showRows(
  values: TaskValues,
  titles: ReadonlyMap<string, string>,
  box: readonly BoxOutput[] | undefined,
  repeated: readonly string[],
): { values: ShowRow[]; settings: ShowRow[]; outputs: ShowRow[]; fields: ShowRow[] } {
  const entrant = new Set(perRunEntrant(values.inputs, values.axes));
  const output = (each: BoxOutput): ShowRow => ({
    name: each.name,
    label: `${each.title ?? each.name}${each.unit === null ? '' : ` (${each.unit})`}`,
  });
  // With nothing repeated the box cannot be told so, and says null: every
  // step is then done once, as the planner classes them.
  const once = (each: BoxOutput) => each.once ?? repeated.length === 0;
  return {
    values: values.scoreValues
      .filter((value) => value.name.trim() !== '')
      .map((value) => ({ name: value.name, label: value.name })),
    settings: values.inputs
      .filter(
        (input) =>
          input.kind === 'value' &&
          input.give !== 'per-run' &&
          input.give !== 'entrant' &&
          input.value !== '',
      )
      .map((input) => ({
        name: input.id,
        label: titles.get(input.id) ?? input.id,
      })),
    outputs: [
      ...(box ?? []).filter(once).map(output),
      { name: 'compiled', label: COMPILED },
    ],
    fields: [
      ...repeated
        .filter((name) => !entrant.has(name))
        .map((name) => ({ name, label: titles.get(name) ?? name })),
      ...RUN_FIELDS,
      ...(box ?? []).filter((each) => !once(each)).map(output),
    ],
  };
}

/** When a part is shown, in words, as the grid's columns name the moments. */
function momentWords(moments: readonly Moment[]): string {
  if (moments.includes('always')) return 'Always';
  if (moments.length === 0) return 'Not shown';
  return moments.length === 2
    ? 'After the deadline or release'
    : (MOMENTS.find((moment) => moment.value === moments[0])?.label ?? 'Not shown');
}

function shownHint(moments: readonly Moment[]): GraphPort['shown'] {
  return moments.includes('always') ? 'always' : moments.length > 0 ? 'later' : 'never';
}

/** The moments a run entry of `of` shows anything at. */
function entryMoments(show: Show, of: string): Moment[] {
  return MOMENTS.filter(({ value }) =>
    show[value].runs.some((entry) => entry.of === of && entry.fields.length > 0),
  ).map(({ value }) => value);
}

function flowBoxes({
  values,
  rows,
  readings,
  troubles,
  scope,
  columns,
  shown: grid,
}: {
  values: TaskValues;
  rows: RunRow[];
  readings: Record<string, Reading | undefined>;
  troubles: Map<string, string>;
  scope: FormulaScope;
  columns: Column[];
  shown: ReturnType<typeof showRows>;
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
  const { show } = values;
  const named = (kind: 'values' | 'inputs' | 'outputs', name: string) => {
    const moments = momentsOf(show, kind, name);
    return { when: momentWords(moments), shown: shownHint(moments) };
  };
  // What each run reports, which every group's runs give.
  const parts = columns.map(
    (column) =>
      `${column.title ?? column.name}${column.unit === null ? '' : ` (${column.unit})`}`,
  );
  const entry = (of: string, label: string, kind: string): GraphPort => {
    const moments = entryMoments(show, of);
    return {
      name: `group:${of}`,
      label,
      side: 'in',
      kind,
      when: momentWords(moments),
      shown: shownHint(moments),
      rows: tagRows(parts),
      parts,
    };
  };
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
        ...named('values', value.name),
      })),
    },
    {
      key: 'groups',
      label: 'Groups',
      parts: [
        ...[
          ...values.scoreGroups,
          { key: 'all', name: 'all', picks: {}, none: false },
        ].map((group) =>
          entry(
            group.name,
            group.name,
            runCount(rows.filter((row) => inGroup(row, group)).length),
          ),
        ),
        // Not a group the formulas read, so nothing wires to it.
        ...(runEntries(show).includes(FIRST_NOT_PASSED)
          ? [
              {
                ...entry(FIRST_NOT_PASSED, 'The first run not passed', '1 run'),
                pin: false,
              },
            ]
          : []),
      ],
    },
    {
      key: 'inputs',
      label: 'Shared inputs',
      parts: grid.settings.map((setting) => ({
        name: `input:${setting.name}`,
        label: setting.label,
        side: 'in' as const,
        pin: false,
        ...named('inputs', setting.name),
      })),
    },
    {
      key: 'once',
      label: 'Once outputs',
      parts: grid.outputs.map((output) => ({
        name: `output:${output.name}`,
        label: output.label,
        side: 'in' as const,
        pin: false,
        kind: columns.find((column) => column.name === output.name)?.kind,
        ...named('outputs', output.name),
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
    open: true,
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
