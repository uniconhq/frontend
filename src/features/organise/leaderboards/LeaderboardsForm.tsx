import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { IconButton } from '@/ui/IconButton';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { ShownValue } from '@/ui/number/ShownValue';
import { heldCount } from '@/ui/number/words';
import { TextInput } from '@/ui/TextInput';
import { Checkbox } from '@/ui/Checkbox';
import { useMe } from '@/session';
import type { FormulaMark } from '../formula/Editor';
import { FormulaCard } from '../formula/FormulaCard';
import { Chip } from '@/ui/Chip';
import { describeFormula, type FormulaScope } from '../formula/parse';
import { written } from '../formula/tree';
import type { FlowAbout } from '../formula/flow';
import { BLOCKS_UNLOADED, type Catalogue } from '../formula/catalogue';
import { FieldBox } from '../contest/ContestFile';
import { useOpenedField } from '../contest/opened';
import type { FormProps } from '../forms/DefinitionFile';
import { LeaveGuard } from '@/ui/LeaveGuard';
import { TimeField } from '../forms/fields';
import { exactJS, isRecord, parseYaml, textOf } from '../forms/yaml-doc';
import { holdsAt } from '../roles';
import { viewFilePath } from '../contest/places';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { CardPart } from '../task/BuildCard';
import shared from '../organise.module.css';
import classes from './leaderboards.module.css';
import {
  audienceSentence,
  withBoardName,
  blankBoard,
  blankColumn,
  boardReadings,
  boardScope,
  columnField,
  commit,
  hourBefore,
  lineOf,
  givenValues,
  previewRows,
  problems,
  readLeaderboards,
  taskIds,
  writeHold,
  writeLeaderboards,
  type BoardDraft,
  type ColumnDraft,
  type FieldProblem,
  type HoldDraft,
  type RowsKind,
  type ShowDraft,
  type TaskGives,
  type SortDraft,
  type Who,
} from './model';

/**
 * The contest's leaderboards and its hold, edited on the leaderboards page
 * and written into `contest.yaml`. A 422's path marks the field it names.
 */

const WAYS = [
  { value: 'desc', label: 'Highest first' },
  { value: 'asc', label: 'Lowest first' },
];

/**
 * What each task gives a leaderboard, the values its settings name, read
 * from each task's `task.yaml`, and which of them give text, from its
 * workflow form; null until every one has been read, so no formula is
 * called unknown meanwhile. A task whose settings cannot be read, or whose
 * form does not say which values give text, is null: its values are not
 * known, so what a formula reads of it is not checked here, as the forge
 * does not check a task it cannot resolve.
 */
function useTaskGives(
  org: string,
  contest: string,
  tasks: readonly string[],
): { values: TaskGives; titles: Record<string, string> } | null {
  const files = useQueries({
    queries: tasks.map((task) => ({
      ...$api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
        { params: { path: { org, contest, task, path: 'task.yaml' } } },
      ),
      retry: false,
    })),
  });
  // Which of each task's values give text, as its workflow form says.
  const forms = useQueries({
    queries: tasks.map((task) => ({
      ...$api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/workflow-form',
        { params: { path: { org, contest, task } } },
      ),
      retry: false,
    })),
  });
  const pending = [...files, ...forms].some((query) => query.isPending);
  const stamp = JSON.stringify([
    files.map((file) => file.data?.content ?? ''),
    forms.map((form) => form.data?.text_values ?? null),
  ]);
  return useMemo(() => {
    if (pending) return null;
    const values = Object.fromEntries(
      tasks.map((task, index) => {
        const content = files[index]?.data?.content;
        const text = forms[index]?.data?.text_values;
        if (content === undefined || text == null) return [task, null];
        return [task, givenValues(content, new Set(text))];
      }),
    );
    const titles = Object.fromEntries(
      tasks.map((task, index) => {
        const parsed = parseYaml(files[index]?.data?.content ?? '');
        const root = 'error' in parsed ? null : exactJS(parsed.doc);
        return [task, isRecord(root) ? textOf(root['name']) || task : task];
      }),
    );
    return { values, titles };
    // `stamp` is the files and the forms. Each list is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, stamp, tasks]);
}

function matches(field: string, path: string): boolean {
  if (field.startsWith('hold.')) return path === field || path.startsWith(`${field}.`);
  const full = `leaderboards.${field}`;
  if (path === full || path.startsWith(`${full}.`)) return true;
  if (field.endsWith('.key')) {
    return path === `leaderboards.${field.slice(0, -'.key'.length)}`;
  }
  return false;
}

function messagesFor(
  field: string,
  local: readonly FieldProblem[],
  refused: readonly DefinitionError[],
): string[] {
  return [
    ...local
      .filter((problem) => problem.field === field)
      .map((problem) => problem.message),
    ...refused
      .filter((error) => matches(field, error.path))
      .map((error) => error.message),
  ];
}

function marksFor(field: string, refused: readonly DefinitionError[]): FormulaMark[] {
  const prefix = `leaderboards.${field}.`;
  return refused.flatMap((error) => {
    if (!error.path.startsWith(prefix)) return [];
    return [
      {
        path: error.path
          .slice(prefix.length)
          .split('.')
          .map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
        message: error.message,
      },
    ];
  });
}

function FieldMessages({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <div role="alert">
      {messages.map((message) => (
        <BodyText key={message}>{message}</BodyText>
      ))}
    </div>
  );
}

function renameColumn(board: BoardDraft, columnKey: string, name: string): BoardDraft {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.key === columnKey
        ? { ...column, name, moved: column.moved ?? column.name }
        : column,
    ),
  };
}

/**
 * The board with the sort and display of a renamed column moved to its new
 * name, once the name is done: not while it is empty or another column's, so
 * a name typed through on the way never takes another column's entries.
 */
function settleColumn(board: BoardDraft, columnKey: string): BoardDraft {
  const column = board.columns.find((item) => item.key === columnKey);
  if (column?.moved === undefined) return board;
  const { moved: from, name: to } = column;
  if (to.trim() === '') return board;
  if (board.columns.some((item) => item.key !== columnKey && item.name === to))
    return board;
  const move = <T extends { name: string }>(item: T): T =>
    item.name === from && from !== '' ? { ...item, name: to } : item;
  return {
    ...board,
    columns: board.columns.map((item) =>
      item.key === columnKey
        ? { key: item.key, name: to, line: item.line, tree: item.tree }
        : item,
    ),
    sort: board.sort.map(move),
    display: board.display.map(move),
  };
}

function dropColumn(board: BoardDraft, columnKey: string): BoardDraft {
  const column = board.columns.find((item) => item.key === columnKey);
  const name = column?.moved ?? column?.name ?? '';
  return {
    ...board,
    columns: board.columns.filter((item) => item.key !== columnKey),
    sort: name === '' ? board.sort : board.sort.filter((item) => item.name !== name),
    display:
      name === '' ? board.display : board.display.filter((item) => item.name !== name),
  };
}

/** What a leaderboard's card is headed with: its name, or its key until it has one. */
function boardTitle(board: BoardDraft): string {
  const title = board.title.trim();
  if (title !== '') return title;
  return board.key === '' ? 'New leaderboard' : board.key;
}

function setWho(board: BoardDraft, who: Who): BoardDraft {
  return {
    ...board,
    who,
    rows: who === 'everyone' && board.rows === 'own' ? 'all' : board.rows,
  };
}

export function LeaderboardsForm({
  org,
  contest,
  doc,
  busy,
  asking,
  saved,
  onSave,
  refused,
}: FormProps & { org: string; contest: string }) {
  const manager = holdsAt(useMe().roles, { kind: 'contest', org, contest }, 'manager');
  const [loaded] = useState(() => readLeaderboards(doc));
  const [draft, setDraft] = useState(loaded);
  // Once a save of this draft went through, leaving loses nothing, even
  // before the file is read back.
  const [sent, setSent] = useState<typeof draft | null>(null);
  const unsaved =
    JSON.stringify(draft) !== JSON.stringify(loaded) && !(saved && sent === draft);
  const [now, setNow] = useState(() => Date.now());
  const [tasks] = useState(() => taskIds(doc));
  const blocks = $api.useQuery('get', '/api/v1/blocks');
  const taskData = useTaskGives(org, contest, tasks);
  const gives = taskData?.values ?? null;
  const unread = tasks.filter((task) => gives?.[task] === null);
  // Formulas are read once the blocks and what every task gives are in.
  const catalogue = gives === null ? null : (blocks.data ?? null);
  const entrants = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/organise/entrants',
    { params: { path: { org, contest } } },
  );
  const root = exactJS(doc);
  const start = isRecord(root) ? root['start'] : undefined;
  const end = isRecord(root) ? root['end'] : undefined;
  const local = useMemo(
    () => problems(draft, catalogue, tasks, gives ?? {}, now, start, end, loaded.hold),
    [catalogue, draft, end, now, gives, start, tasks, loaded.hold],
  );
  useOpenedField(!loaded.legacy);
  const disabled = !manager || busy || asking;
  const save = () => {
    if (catalogue === null || gives === null) return;
    const at = Date.now();
    if (at !== now) setNow(at);
    if (
      problems(draft, catalogue, tasks, gives, at, start, end, loaded.hold).length > 0
    )
      return;
    const next = commit(draft, catalogue, tasks, gives);
    setSent(draft);
    onSave((file) => {
      writeLeaderboards(file, loaded, next);
      writeHold(file, loaded, next);
    });
  };
  if (loaded.legacy) {
    return (
      <div role="alert">
        <BodyText>
          These leaderboards cannot be read, so they cannot be changed here.
        </BodyText>
        <BodyText tone="secondary">
          Fix them as text in{' '}
          <PageLink to={viewFilePath(org, contest)}>the stored settings</PageLink>.
        </BodyText>
      </div>
    );
  }
  const edit = (id: string, change: (board: BoardDraft) => BoardDraft) =>
    setDraft((current) => ({
      ...current,
      boards: current.boards.map((board) => (board.id === id ? change(board) : board)),
    }));
  return (
    <form
      aria-label="Leaderboards"
      className={shared.stack}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {blocks.isError && <BodyText>{BLOCKS_UNLOADED}</BodyText>}
      {unread.length > 0 && (
        <BodyText tone="secondary">
          {`The settings of ${unread.join(', ')} could not be read, so what a leaderboard reads of ${unread.length === 1 ? 'it' : 'them'} is not checked here.`}
        </BodyText>
      )}
      {draft.boards.map((board) => (
        <BoardCard
          key={board.id}
          org={org}
          contest={contest}
          board={board}
          boards={draft.boards}
          tasks={tasks}
          gives={gives ?? {}}
          catalogue={catalogue}
          entrants={entrants.data ?? []}
          local={local}
          refused={refused}
          disabled={disabled}
          titles={taskData?.titles ?? {}}
          onChange={(change) => edit(board.id, change)}
          onRemove={() =>
            setDraft((current) => ({
              ...current,
              boards: current.boards.filter((item) => item.id !== board.id),
            }))
          }
        />
      ))}
      <div className={classes.ownWidth}>
        {!disabled && (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                boards: [
                  ...current.boards,
                  blankBoard([
                    ...tasks,
                    ...current.boards.map((board) => board.key),
                    ...current.boards.flatMap((board) =>
                      board.columns.map((column) => column.name),
                    ),
                  ]),
                ],
              }))
            }
          >
            Add a leaderboard
          </Button>
        )}
      </div>
      {/* A freeze set with no leaderboard left stays shown, so it can be turned off. */}
      {(draft.boards.length > 0 || draft.hold.on) && (
        <HoldFields
          hold={draft.hold}
          end={end}
          local={local}
          refused={refused}
          disabled={disabled}
          locked={loaded.hold.locked}
          onChange={(hold) => setDraft((current) => ({ ...current, hold }))}
        />
      )}
      {!disabled && (
        <div className={classes.ownWidth}>
          <Button
            type="submit"
            disabled={disabled || catalogue === null}
            loading={busy}
          >
            Save
          </Button>
        </div>
      )}
      <LeaveGuard dirty={unsaved} what="Your changes to the leaderboards" />
    </form>
  );
}

function BoardCard({
  org,
  contest,
  board,
  boards,
  tasks,
  gives,
  catalogue,
  entrants,
  local,
  refused,
  disabled,
  titles,
  onChange,
  onRemove,
}: {
  org: string;
  contest: string;
  board: BoardDraft;
  boards: readonly BoardDraft[];
  tasks: readonly string[];
  gives: TaskGives;
  catalogue: Catalogue | null;
  entrants: { id: string; display_name: string }[];
  local: readonly FieldProblem[];
  refused: readonly DefinitionError[];
  disabled: boolean;
  titles: Record<string, string>;
  onChange: (change: (board: BoardDraft) => BoardDraft) => void;
  onRemove: () => void;
}) {
  const [added, setAdded] = useState<string | null>(null);
  const readings =
    catalogue === null ? {} : boardReadings(board, boards, tasks, gives, catalogue);
  const texts = board.columns
    .filter((column) => readings[column.key]?.kind === 'text')
    .map((column) => column.name);
  const others = boards.filter((other) => other.id !== board.id);
  const otherReadings = others.map((other) => ({
    board: other,
    readings:
      catalogue === null ? {} : boardReadings(other, boards, tasks, gives, catalogue),
  }));
  const otherKinds = otherReadings.flatMap(({ board: other, readings }) =>
    other.columns.map((column) => ({
      name: `${written(other.key)}.${written(column.name)}`,
      kind: readings[column.key]?.kind,
    })),
  );
  const scope =
    catalogue === null
      ? null
      : {
          ...boardScope(board, boards, tasks, gives, catalogue.leaderboard_facts, [
            ...texts,
            ...otherKinds
              .filter((column) => column.kind === 'text')
              .map((column) => column.name),
          ]),
          picks: board.columns
            .filter((column) => readings[column.key]?.kind === 'pick')
            .map((column) => written(column.name))
            .concat(
              otherKinds
                .filter((column) => column.kind === 'pick')
                .map((column) => column.name),
            ),
        };
  const names = board.columns
    .filter((column) => column.name !== '')
    .map((column) => ({ value: column.name, label: column.name }));
  const flowNames = new Map<string, Omit<FlowAbout, 'name'>>();
  for (const task of tasks)
    flowNames.set(written(task), { kind: 'task', description: titles[task] ?? task });
  for (const column of board.columns) {
    const node = readings[column.key]?.node;
    flowNames.set(written(column.name), {
      kind: 'column',
      description:
        node != null && scope !== null
          ? describeFormula(node, scope)
          : lineOf(column, catalogue),
    });
  }
  for (const { board: other, readings } of otherReadings) {
    for (const column of other.columns) {
      const node = readings[column.key]?.node;
      flowNames.set(`${written(other.key)}.${written(column.name)}`, {
        kind: 'column',
        description:
          node != null && scope !== null
            ? describeFormula(node, scope)
            : lineOf(column, catalogue),
      });
    }
  }
  const at = (field: string) => messagesFor(field, local, refused);
  return (
    <section
      aria-label={`Leaderboard ${board.key === '' ? 'new' : board.key}`}
      className={shared.stack}
    >
      <Card>
        <div className={shared.stack}>
          <div className={classes.head}>
            <SectionTitle>{boardTitle(board)}</SectionTitle>
            {!disabled && (
              <Button variant="secondary" disabled={disabled} onClick={onRemove}>
                Remove leaderboard
              </Button>
            )}
          </div>
          <div>
            <FieldBox name={`${board.key}.key`}>
              <FieldBox name={`${board.key}.title`}>
                <TextInput
                  label="Name"
                  value={board.title}
                  placeholder={board.key}
                  width="lg"
                  disabled={disabled}
                  error={at(`${board.key}.key`)[0] ?? at(`${board.key}.title`)[0]}
                  onChange={(title) =>
                    onChange((current) =>
                      withBoardName(current, title, [
                        ...tasks,
                        ...boards
                          .filter((other) => other.id !== current.id)
                          .map((other) => other.key),
                        ...boards.flatMap((other) =>
                          other.columns.map((column) => column.name),
                        ),
                      ]),
                    )
                  }
                />
              </FieldBox>
            </FieldBox>
            <BodyText size="sm" tone="secondary">
              Its link and its name in other leaderboards' formulas: {board.key}
            </BodyText>
          </div>
          <div className={classes.audience}>
            <FieldBox name={`${board.key}.audience.who`}>
              <RadioGroup
                label="Who can see this leaderboard?"
                value={board.who}
                disabled={disabled}
                error={at(`${board.key}.audience.who`)[0]}
                options={[
                  {
                    value: 'staff',
                    label: 'Organisers only',
                    description:
                      'Entrants never see it. Use it to check the numbers first.',
                  },
                  {
                    value: 'entrants',
                    label: 'Entrants',
                    description: 'Everyone entered in this contest, once signed in.',
                  },
                  {
                    value: 'everyone',
                    label: 'Anyone',
                    description:
                      "People who are not signed in too, on the contest's public page.",
                  },
                ]}
                onChange={(who) => onChange((current) => setWho(current, who as Who))}
              />
            </FieldBox>
            <FieldBox name={`${board.key}.audience.rows`}>
              <RadioGroup
                label="How many rows do they see?"
                value={board.rows}
                disabled={disabled || board.who === 'staff'}
                description={
                  board.who === 'staff'
                    ? 'Organisers always see every row, so this matters once entrants can see it.'
                    : undefined
                }
                error={at(`${board.key}.audience.rows`)[0]}
                options={[
                  {
                    value: 'all',
                    label: 'Every row',
                    description: "Every entrant's row, ranked.",
                  },
                  {
                    value: 'own',
                    label: 'Only their own row',
                    description:
                      'Each entrant sees their row and no place, like a grade.',
                    disabled: board.who === 'everyone',
                    reason:
                      'Someone who is not signed in has no row. Choose Entrants to use this.',
                  },
                  {
                    value: 'top',
                    label: 'The top rows',
                    description:
                      'Rows tied with the last stay, and each entrant also sees their own row.',
                    beside: (
                      <TextInput
                        label="How many"
                        value={board.top}
                        inputMode="decimal"
                        width="xs"
                        disabled={disabled || board.who === 'staff'}
                        onChange={(top) => onChange((current) => ({ ...current, top }))}
                      />
                    ),
                  },
                ]}
                onChange={(rows) =>
                  onChange((current) => ({ ...current, rows: rows as RowsKind }))
                }
              />
            </FieldBox>
          </div>
          <div className={classes.sentence}>
            <BodyText>{audienceSentence(board.who, board.rows, board.top)}</BodyText>
          </div>
          <CardPart title="Columns">
            {board.columns.map((column) => (
              <ColumnFields
                key={column.key}
                column={column}
                boardKey={board.key}
                kind={readings[column.key]?.kind ?? null}
                catalogue={catalogue}
                scope={scope}
                local={local}
                refused={refused}
                disabled={disabled}
                names={flowNames}
                autoFocus={added === column.key}
                onName={(name) =>
                  onChange((current) => renameColumn(current, column.key, name))
                }
                onNamed={() => onChange((current) => settleColumn(current, column.key))}
                onLine={(line) =>
                  onChange((current) => ({
                    ...current,
                    columns: current.columns.map((item) =>
                      item.key === column.key ? { ...item, line } : item,
                    ),
                  }))
                }
                onRemove={() => onChange((current) => dropColumn(current, column.key))}
              />
            ))}
            <div className={classes.ownWidth}>
              {!disabled && (
                <Button
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    const column = blankColumn(
                      [
                        ...board.columns.map((column) => column.name),
                        ...tasks,
                        ...boards.map((other) => other.key),
                      ],
                      board.columns.length + 1,
                    );
                    setAdded(column.key);
                    onChange((current) => ({
                      ...current,
                      columns: [...current.columns, column],
                    }));
                  }}
                >
                  Add a column
                </Button>
              )}
            </div>
          </CardPart>
          <CardPart
            title="Ranking"
            line="Each one after the first breaks the ties the ones before it leave."
          >
            <FieldBox name={`${board.key}.sort`}>
              <FieldMessages messages={at(`${board.key}.sort`)} />
              {board.sort.map((item, index) => (
                <SortRow
                  key={`${item.name}:${String(index)}`}
                  item={item}
                  index={index}
                  names={names.filter(
                    (name) =>
                      name.value === item.name ||
                      !board.sort.some((other) => other.name === name.value),
                  )}
                  disabled={disabled}
                  onChange={(sort) =>
                    onChange((current) => ({
                      ...current,
                      sort: current.sort.map((entry, atIndex) =>
                        atIndex === index ? sort : entry,
                      ),
                    }))
                  }
                  onRemove={() =>
                    onChange((current) => ({
                      ...current,
                      sort: current.sort.filter((_, atIndex) => atIndex !== index),
                    }))
                  }
                />
              ))}
              {!disabled && (
                <Button
                  variant="secondary"
                  disabled={disabled || names.length === 0}
                  onClick={() =>
                    onChange((current) => {
                      const next = current.columns.find(
                        (column) =>
                          !current.sort.some((item) => item.name === column.name),
                      );
                      if (next === undefined || next.name === '') return current;
                      return {
                        ...current,
                        sort: [...current.sort, { name: next.name, way: 'desc' }],
                      };
                    })
                  }
                >
                  {board.sort.length === 0 ? 'Rank by' : 'Add a tie-break'}
                </Button>
              )}
            </FieldBox>
          </CardPart>
          <CardPart title="Shown on the leaderboard">
            <FieldBox name={`${board.key}.display`}>
              <FieldMessages messages={at(`${board.key}.display`)} />
              {board.display.map((item, index) => (
                <DisplayRow
                  key={`${item.name}:${String(index)}`}
                  item={item}
                  names={names}
                  kind={
                    readings[
                      board.columns.find((column) => column.name === item.name)?.key ??
                        ''
                    ]?.kind
                  }
                  disabled={disabled}
                  onChange={(display) =>
                    onChange((current) => ({
                      ...current,
                      display: current.display.map((entry, atIndex) =>
                        atIndex === index ? display : entry,
                      ),
                    }))
                  }
                  onRemove={() =>
                    onChange((current) => ({
                      ...current,
                      display: current.display.filter(
                        (_, atIndex) => atIndex !== index,
                      ),
                    }))
                  }
                />
              ))}
              {!disabled && (
                <Button
                  variant="secondary"
                  disabled={disabled || names.length === 0}
                  onClick={() =>
                    onChange((current) => {
                      const next = current.columns.find(
                        (column) =>
                          !current.display.some((item) => item.name === column.name),
                      );
                      if (next === undefined || next.name === '') return current;
                      return {
                        ...current,
                        display: [
                          ...current.display,
                          { name: next.name, decimals: '' },
                        ],
                      };
                    })
                  }
                >
                  Add a column to show
                </Button>
              )}
            </FieldBox>
          </CardPart>
          <Preview
            org={org}
            contest={contest}
            board={board}
            entrants={entrants}
            disabled={disabled}
          />
        </div>
      </Card>
    </section>
  );
}

function ColumnFields({
  column,
  boardKey,
  kind,
  catalogue,
  scope,
  local,
  refused,
  disabled,
  names,
  autoFocus,
  onName,
  onNamed,
  onLine,
  onRemove,
}: {
  column: ColumnDraft;
  boardKey: string;
  kind: string | null;
  catalogue: Catalogue | null;
  scope: FormulaScope | null;
  local: readonly FieldProblem[];
  refused: readonly DefinitionError[];
  disabled: boolean;
  names: ReadonlyMap<string, Omit<FlowAbout, 'name'>>;
  autoFocus: boolean;
  onName: (name: string) => void;
  onNamed: () => void;
  onLine: (line: string) => void;
  onRemove: () => void;
}) {
  const field = columnField(boardKey, column);
  const messages = messagesFor(field, local, refused);
  const name = column.name === '' ? 'the new column' : column.name;
  const head = (
    <div className={classes.head}>
      <TextInput
        label="Name"
        value={column.name}
        width="lg"
        disabled={disabled}
        error={catalogue === null || scope === null ? messages[0] : undefined}
        onChange={onName}
        onCommit={onNamed}
      />
      <Chip tone={messages.length > 0 ? 'warn' : 'quiet'}>
        {lineOf(column, catalogue).trim() === ''
          ? 'empty'
          : messages.length > 0
            ? 'to fix'
            : (kind ?? 'to fix')}
      </Chip>
      <span className={classes.gap} />
      {!disabled && (
        <IconButton
          sign="✕"
          label={`Remove ${column.name === '' ? 'column' : column.name}`}
          disabled={disabled}
          onClick={onRemove}
        />
      )}
    </div>
  );
  return (
    <div role="group" data-field={field} aria-label={name}>
      {catalogue === null || scope === null ? (
        <Card>{head}</Card>
      ) : (
        <FormulaCard
          disabled={disabled}
          head={head}
          name={name}
          names={names}
          label={name}
          scope={scope}
          catalogue={catalogue}
          value={lineOf(column, catalogue)}
          marks={marksFor(field, refused)}
          trouble={messages[0]}
          autoFocus={autoFocus}
          onChange={onLine}
        />
      )}
    </div>
  );
}

function SortRow({
  index,
  item,
  names,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  item: SortDraft;
  names: { value: string; label: string }[];
  disabled: boolean;
  onChange: (item: SortDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className={classes.row}>
      <span>{index === 0 ? 'Rank by' : 'then'}</span>
      <Select
        label={`Rank by, ${String(index + 1)}${index === 0 ? 'st' : index === 1 ? 'nd' : index === 2 ? 'rd' : 'th'}`}
        width="md"
        labelHidden
        value={item.name}
        options={names}
        disabled={disabled}
        onChange={(name) => onChange({ ...item, name })}
      />
      <Select
        label={`Order of ${item.name}`}
        labelHidden
        width="sm"
        value={item.way}
        options={WAYS}
        disabled={disabled}
        onChange={(way) => onChange({ ...item, way: way === 'asc' ? 'asc' : 'desc' })}
      />
      {!disabled && (
        <IconButton
          sign="✕"
          label={`Remove ranking ${String(index + 1)}`}
          disabled={disabled}
          onClick={onRemove}
        />
      )}
    </div>
  );
}

function DisplayRow({
  item,
  names,
  kind,
  disabled,
  onChange,
  onRemove,
}: {
  item: ShowDraft;
  names: { value: string; label: string }[];
  kind: string | null | undefined;
  disabled: boolean;
  onChange: (item: ShowDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className={classes.row}>
      <Select
        label={`Shown column ${item.name}`}
        width="md"
        labelHidden
        value={item.name}
        options={names}
        disabled={disabled}
        onChange={(name) => onChange({ ...item, name })}
      />
      {kind !== 'text' && kind !== 'pick' && (
        <>
          <span>with</span>
          <TextInput
            label={`Decimals of ${item.name}`}
            labelHidden
            width="xs"
            value={item.decimals}
            inputMode="decimal"
            disabled={disabled}
            placeholder="As given"
            onChange={(decimals) => onChange({ ...item, decimals })}
          />
          <span>decimals</span>
        </>
      )}
      {kind === 'text' && <BodyText tone="secondary">shown as text</BodyText>}
      {!disabled && (
        <IconButton
          sign="✕"
          label={`Stop showing ${item.name}`}
          disabled={disabled}
          onClick={onRemove}
        />
      )}
    </div>
  );
}

function Preview({
  org,
  contest,
  board,
  entrants,
  disabled,
}: {
  org: string;
  contest: string;
  board: BoardDraft;
  entrants: { id: string; display_name: string }[];
  disabled: boolean;
}) {
  const [entrant, setEntrant] = useState('');
  const preview = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/leaderboards/{leaderboard}',
    { params: { path: { org, contest, leaderboard: board.key } } },
    {
      enabled: entrant !== '' && board.who !== 'staff' && board.key !== '',
      retry: false,
    },
  );
  const options = entrants.map((item) => ({
    value: item.id,
    label: item.display_name === '' ? item.id : item.display_name,
  }));
  const top = Number(board.top);
  const rows =
    preview.data === undefined
      ? []
      : previewRows(preview.data.rows, entrant, board.rows, top);
  return (
    <FieldBox name={`${board.key}.preview`}>
      <Select
        label="See it as"
        width="lg"
        value={entrant}
        options={options}
        placeholder="An entrant"
        disabled={disabled || options.length === 0}
        description={
          options.length === 0
            ? 'Nobody has registered, so there is no row to preview.'
            : undefined
        }
        onChange={setEntrant}
      />
      {board.who === 'staff' && entrant !== '' && (
        <BodyText>Entrants do not see this leaderboard.</BodyText>
      )}
      {preview.isError && <BodyText>Save the leaderboard to preview it.</BodyText>}
      {rows.length > 0 && (
        <>
          <BodyText tone="secondary">
            A hold and a hidden cell stay as staff see them.
          </BodyText>
          <ul aria-label="Preview">
            {rows.map((row) => (
              <PreviewRow
                key={row.row.entrant}
                row={row}
                own={row.row.entrant === entrant}
              />
            ))}
          </ul>
        </>
      )}
    </FieldBox>
  );
}

function PreviewRow({
  row,
  own,
}: {
  row: {
    place: number | null;
    held: number;
    row: { entrant: string; name: string };
    cells: {
      column: string;
      number: string | null;
      text: string | null;
      hidden: boolean;
      waiting: { task: string }[] | null;
    }[];
  };
  own: boolean;
}) {
  return (
    <li>
      <BodyText>
        {row.place === null ? '–' : String(row.place)} {row.row.name}
        {own ? ' This entrant' : ''}
        {row.held > 0 ? ` ${heldCount(row.held)}` : ''}
      </BodyText>
      {row.cells.map((cell) => (
        <ShownValue
          key={cell.column}
          number={cell.number}
          text={cell.text}
          hidden={cell.hidden}
          waiting={cell.waiting !== null && cell.waiting.length > 0}
        />
      ))}
    </li>
  );
}

function HoldFields({
  hold,
  end,
  local,
  refused,
  disabled,
  locked,
  onChange,
}: {
  hold: HoldDraft;
  end: unknown;
  local: readonly FieldProblem[];
  refused: readonly DefinitionError[];
  disabled: boolean;
  locked: boolean;
  onChange: (hold: HoldDraft) => void;
}) {
  const hour = hourBefore(end);
  const from = messagesFor('hold.from', local, refused);
  const until = messagesFor('hold.until', local, refused);
  return (
    <section aria-label="Freeze">
      <Card>
        <div className={shared.stack}>
          <SectionTitle>Freeze</SectionTitle>
          <BodyText tone="secondary">
            Keep the final results a surprise. From a time you pick, people stop seeing
            each other's new results: every leaderboard stays as it was, with a note
            like "3 held" for what came in since. Entrants still see their own results,
            and organisers see everything. When the freeze ends, everything held back
            shows up at once.
          </BodyText>
          {locked && (
            <BodyText>The freeze cannot be read. Set it again to replace it.</BodyText>
          )}
          <Checkbox
            label="Freeze the leaderboards near the end"
            checked={hold.on}
            disabled={disabled}
            onChange={(on) => onChange({ ...hold, on })}
          />
          {hold.on && (
            <>
              <FieldBox name="hold.from">
                <TimeField
                  label="Freeze from"
                  value={hold.from}
                  width="lg"
                  disabled={disabled}
                  onChange={(next) => onChange({ ...hold, from: next })}
                />
                <FieldMessages messages={from} />
                {!disabled && (
                  <Button
                    variant="secondary"
                    disabled={disabled || hour === ''}
                    onClick={() => onChange({ ...hold, from: hour })}
                  >
                    An hour before the end
                  </Button>
                )}
              </FieldBox>
              <FieldBox name="hold.until">
                <RadioGroup
                  label="Until"
                  value={hold.untilStaff ? 'staff' : 'time'}
                  disabled={disabled}
                  error={until[0]}
                  options={[
                    { value: 'staff', label: 'An organiser ends it' },
                    { value: 'time', label: 'A time' },
                  ]}
                  onChange={(value) =>
                    onChange({ ...hold, untilStaff: value === 'staff' })
                  }
                />
                {!hold.untilStaff && (
                  <TimeField
                    label="End the freeze at"
                    value={hold.until}
                    width="lg"
                    disabled={disabled}
                    onChange={(next) => onChange({ ...hold, until: next })}
                  />
                )}
              </FieldBox>
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
