import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { ShownValue } from '@/ui/number/ShownValue';
import { heldCount } from '@/ui/number/words';
import { TextInput } from '@/ui/TextInput';
import { Checkbox } from '@/ui/Checkbox';
import { useMe } from '@/session';
import { FormulaLine, FormulaTiles, type FormulaMark } from '../formula/Editor';
import type { Catalogue } from '../formula/catalogue';
import { useFormulaTarget } from '../formula/target';
import { FieldBox } from '../contest/ContestFile';
import { useOpenedField } from '../contest/opened';
import type { FormProps } from '../forms/DefinitionFile';
import { TimeField } from '../forms/fields';
import { exactJS, isRecord } from '../forms/yaml-doc';
import { holdsAt } from '../roles';
import { viewFilePath } from '../contest/places';
import { PageLink } from '@/ui/PageLink';
import shared from '../organise.module.css';
import {
  KEY_MAX,
  OWN_EVERYONE,
  blankBoard,
  blankColumn,
  boardReadings,
  boardScope,
  columnField,
  commit,
  hourBefore,
  lineOf,
  outputNames,
  previewRows,
  problems,
  readLeaderboards,
  taskIds,
  workflowRef,
  writeHold,
  writeLeaderboards,
  type BoardDraft,
  type ColumnDraft,
  type FieldProblem,
  type HoldDraft,
  type RowsKind,
  type ShowDraft,
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

function useOutputs(org: string, contest: string, tasks: readonly string[]): string[] {
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
  const fileStamp = files.map((file) => file.data?.content ?? '').join('\0');
  const refs = useMemo(() => {
    const found = new Map<string, { owner: string; name: string; version: string }>();
    for (const file of files) {
      const content = file.data?.content;
      if (content === undefined) continue;
      const ref = workflowRef(content);
      if (ref === null) continue;
      found.set(`${ref.owner}/${ref.name}@${ref.version}`, ref);
    }
    return [...found.values()];
    // `fileStamp` is the files. `files` is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileStamp]);
  const versions = useQueries({
    queries: refs.map((ref) => ({
      ...$api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/versions/{version}', {
        params: { path: ref },
      }),
      retry: false,
    })),
  });
  const versionStamp = versions.map((version) => version.data?.content ?? '').join('\0');
  return useMemo(() => {
    const names = new Set<string>();
    for (const version of versions) {
      const content = version.data?.content;
      if (content !== undefined) for (const name of outputNames(content)) names.add(name);
    }
    return [...names];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionStamp]);
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
    ...local.filter((problem) => problem.field === field).map((problem) => problem.message),
    ...refused.filter((error) => matches(field, error.path)).map((error) => error.message),
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
  const old = board.columns.find((column) => column.key === columnKey)?.name ?? '';
  const move = <T extends { name: string }>(item: T): T =>
    item.name === old && old !== '' ? { ...item, name } : item;
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.key === columnKey ? { ...column, name } : column,
    ),
    sort: board.sort.map(move),
    display: board.display.map(move),
  };
}

function dropColumn(board: BoardDraft, columnKey: string): BoardDraft {
  const name = board.columns.find((column) => column.key === columnKey)?.name ?? '';
  return {
    ...board,
    columns: board.columns.filter((column) => column.key !== columnKey),
    sort: name === '' ? board.sort : board.sort.filter((item) => item.name !== name),
    display: name === '' ? board.display : board.display.filter((item) => item.name !== name),
  };
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
  onSave,
  refused,
}: FormProps & { org: string; contest: string }) {
  const manager = holdsAt(useMe().roles, { kind: 'contest', org, contest }, 'manager');
  const [loaded] = useState(() => readLeaderboards(doc));
  const [draft, setDraft] = useState(loaded);
  const [now, setNow] = useState(() => Date.now());
  const [tasks] = useState(() => taskIds(doc));
  const outputs = useOutputs(org, contest, tasks);
  const blocks = $api.useQuery('get', '/api/v1/blocks');
  const catalogue = blocks.data ?? null;
  const entrants = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/organise/entrants',
    { params: { path: { org, contest } } },
  );
  const root = exactJS(doc);
  const start = isRecord(root) ? root['start'] : undefined;
  const end = isRecord(root) ? root['end'] : undefined;
  const local = useMemo(
    () => problems(draft, catalogue, tasks, outputs, now, start, end),
    [catalogue, draft, end, now, outputs, start, tasks],
  );
  const target = useFormulaTarget();
  useOpenedField(!loaded.legacy);
  const disabled = !manager || busy || asking;
  const save = () => {
    if (catalogue === null) return;
    const at = Date.now();
    if (at !== now) setNow(at);
    if (problems(draft, catalogue, tasks, outputs, at, start, end).length > 0) return;
    const next = commit(draft, catalogue, tasks, outputs);
    onSave((file) => {
      writeLeaderboards(file, loaded, next);
      writeHold(file, loaded, next);
    });
  };
  if (loaded.legacy) {
    return (
      <div role="alert">
        <BodyText>These leaderboards cannot be read, so they cannot be changed here.</BodyText>
        <BodyText tone="secondary">
          An admin can fix them as text in{' '}
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
      {!manager && (
        <BodyText tone="secondary">Only a manager of the contest can change these.</BodyText>
      )}
      {draft.boards.map((board) => (
        <BoardCard
          key={board.id}
          org={org}
          contest={contest}
          board={board}
          boards={draft.boards}
          tasks={tasks}
          outputs={outputs}
          catalogue={catalogue}
          entrants={entrants.data ?? []}
          local={local}
          refused={refused}
          disabled={disabled}
          focused={target.place}
          onFocus={(name, insert) => target.focus(name, insert, name)}
          onInsert={target.insert}
          tileTarget={target.place === null ? null : target.target}
          onChange={(change) => edit(board.id, change)}
          onRemove={() =>
            setDraft((current) => ({
              ...current,
              boards: current.boards.filter((item) => item.id !== board.id),
            }))
          }
        />
      ))}
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() =>
          setDraft((current) => ({
            ...current,
            boards: [...current.boards, blankBoard(current.boards.map((board) => board.key))],
          }))
        }
      >
        Add a leaderboard
      </Button>
      <HoldFields
        hold={draft.hold}
        end={end}
        local={local}
        refused={refused}
        disabled={disabled}
        locked={loaded.hold.locked}
        onChange={(hold) => setDraft((current) => ({ ...current, hold }))}
      />
      <Button type="submit" disabled={disabled || catalogue === null} loading={busy}>
        Save
      </Button>
    </form>
  );
}

function BoardCard({
  org,
  contest,
  board,
  boards,
  tasks,
  outputs,
  catalogue,
  entrants,
  local,
  refused,
  disabled,
  focused,
  tileTarget,
  onFocus,
  onInsert,
  onChange,
  onRemove,
}: {
  org: string;
  contest: string;
  board: BoardDraft;
  boards: readonly BoardDraft[];
  tasks: readonly string[];
  outputs: readonly string[];
  catalogue: Catalogue | null;
  entrants: { id: string; display_name: string }[];
  local: readonly FieldProblem[];
  refused: readonly DefinitionError[];
  disabled: boolean;
  focused: string | null;
  tileTarget: string | null;
  onFocus: (name: string, insert: (piece: { text: string; caret?: number }) => void) => void;
  onInsert: (piece: { text: string; caret?: number }) => void;
  onChange: (change: (board: BoardDraft) => BoardDraft) => void;
  onRemove: () => void;
}) {
  const readings =
    catalogue === null ? {} : boardReadings(board, boards, tasks, outputs, catalogue);
  const texts = board.columns
    .filter((column) => readings[column.key]?.kind === 'text')
    .map((column) => column.name);
  const scope =
    catalogue === null ? null : boardScope(board, boards, tasks, outputs, texts);
  const names = board.columns
    .filter((column) => column.name !== '')
    .map((column) => ({ value: column.name, label: column.name }));
  const at = (field: string) => messagesFor(field, local, refused);
  return (
    <section aria-label={`Leaderboard ${board.key === '' ? 'new' : board.key}`} className={shared.stack}>
      <FieldBox name={`${board.key}.key`}>
        <TextInput
          label="Key"
          value={board.key}
          maxLength={KEY_MAX}
          disabled={disabled}
          error={at(`${board.key}.key`)[0]}
          onChange={(key) => onChange((current) => ({ ...current, key }))}
        />
      </FieldBox>
      <FieldBox name={`${board.key}.title`}>
        <TextInput
          label="Title"
          value={board.title}
          disabled={disabled}
          error={at(`${board.key}.title`)[0]}
          onChange={(title) => onChange((current) => ({ ...current, title }))}
        />
      </FieldBox>
      <FieldBox name={`${board.key}.audience.who`}>
        <RadioGroup
          label="Who sees it"
          value={board.who}
          disabled={disabled}
          error={at(`${board.key}.audience.who`)[0]}
          options={[
            { value: 'staff', label: 'Staff', description: 'Entrants do not see it.' },
            { value: 'entrants', label: 'Entrants' },
            { value: 'everyone', label: 'Everyone' },
          ]}
          onChange={(who) => onChange((current) => setWho(current, who as Who))}
        />
      </FieldBox>
      <FieldBox name={`${board.key}.audience.rows`}>
        <RadioGroup
          label="Rows"
          value={board.rows}
          disabled={disabled}
          error={at(`${board.key}.audience.rows`)[0]}
          options={[
            { value: 'all', label: 'Every row' },
            {
              value: 'own',
              label: "Each entrant's own row",
              disabled: board.who === 'everyone',
              reason: OWN_EVERYONE,
            },
            { value: 'top', label: 'The top rows' },
          ]}
          onChange={(rows) => onChange((current) => ({ ...current, rows: rows as RowsKind }))}
        />
        {board.rows === 'top' && (
          <TextInput
            label="How many"
            value={board.top}
            inputMode="decimal"
            disabled={disabled}
            onChange={(top) => onChange((current) => ({ ...current, top }))}
          />
        )}
      </FieldBox>
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
          focused={focused === column.key}
          tileTarget={tileTarget}
          onFocus={onFocus}
          onInsert={onInsert}
          onName={(name) => onChange((current) => renameColumn(current, column.key, name))}
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
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() =>
          onChange((current) => ({ ...current, columns: [...current.columns, blankColumn()] }))
        }
      >
        Add a column
      </Button>
      <FieldBox name={`${board.key}.sort`}>
        <BodyText>Sort</BodyText>
        <BodyText tone="secondary">
          Each column after the first breaks the ties the ones before it leave.
        </BodyText>
        <FieldMessages messages={at(`${board.key}.sort`)} />
        {board.sort.map((item, index) => (
          <SortRow
            key={`${item.name}:${String(index)}`}
            item={item}
            names={names}
            disabled={disabled}
            onChange={(sort) =>
              onChange((current) => ({
                ...current,
                sort: current.sort.map((entry, atIndex) => (atIndex === index ? sort : entry)),
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
        <Button
          variant="secondary"
          size="xs"
          disabled={disabled || names.length === 0}
          onClick={() =>
            onChange((current) => {
              const next = current.columns.find(
                (column) => !current.sort.some((item) => item.name === column.name),
              );
              if (next === undefined || next.name === '') return current;
              return { ...current, sort: [...current.sort, { name: next.name, way: 'desc' }] };
            })
          }
        >
          Add a sort
        </Button>
      </FieldBox>
      <FieldBox name={`${board.key}.display`}>
        <BodyText>Display</BodyText>
        <FieldMessages messages={at(`${board.key}.display`)} />
        {board.display.map((item, index) => (
          <DisplayRow
            key={`${item.name}:${String(index)}`}
            item={item}
            names={names}
            kind={readings[board.columns.find((column) => column.name === item.name)?.key ?? '']?.kind}
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
                display: current.display.filter((_, atIndex) => atIndex !== index),
              }))
            }
          />
        ))}
        <Button
          variant="secondary"
          size="xs"
          disabled={disabled || names.length === 0}
          onClick={() =>
            onChange((current) => {
              const next = current.columns.find(
                (column) => !current.display.some((item) => item.name === column.name),
              );
              if (next === undefined || next.name === '') return current;
              return {
                ...current,
                display: [...current.display, { name: next.name, places: '' }],
              };
            })
          }
        >
          Add a column to show
        </Button>
      </FieldBox>
      <Preview
        org={org}
        contest={contest}
        board={board}
        entrants={entrants}
        disabled={disabled}
      />
      <Button
        variant="secondary"
        size="xs"
        label={`Remove ${board.key === '' ? 'leaderboard' : board.key}`}
        disabled={disabled}
        onClick={onRemove}
      >
        Remove
      </Button>
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
  focused,
  tileTarget,
  onFocus,
  onInsert,
  onName,
  onLine,
  onRemove,
}: {
  column: ColumnDraft;
  boardKey: string;
  kind: string | null;
  catalogue: Catalogue | null;
  scope: ReturnType<typeof boardScope> | null;
  local: readonly FieldProblem[];
  refused: readonly DefinitionError[];
  disabled: boolean;
  focused: boolean;
  tileTarget: string | null;
  onFocus: (name: string, insert: (piece: { text: string; caret?: number }) => void) => void;
  onInsert: (piece: { text: string; caret?: number }) => void;
  onName: (name: string) => void;
  onLine: (line: string) => void;
  onRemove: () => void;
}) {
  const field = columnField(boardKey, column);
  const messages = messagesFor(field, local, refused);
  return (
    <div data-field={field} aria-label={column.name === '' ? 'Column' : column.name}>
      <TextInput
        label="Name"
        value={column.name}
        disabled={disabled}
        error={messages[0]}
        onChange={onName}
      />
      {messages.length > 1 && <FieldMessages messages={messages.slice(1)} />}
      {catalogue !== null && scope !== null && (
        <FormulaLine
          label={column.name === '' ? column.key : column.name}
          scope={scope}
          catalogue={catalogue}
          value={lineOf(column, catalogue)}
          marks={marksFor(field, refused)}
          onFocusLine={(insert) => onFocus(column.key, insert)}
          onChange={onLine}
        />
      )}
      {focused && catalogue !== null && scope !== null && (
        <FormulaTiles
          scope={scope}
          catalogue={catalogue}
          target={tileTarget}
          onInsert={onInsert}
        />
      )}
      {kind === 'text' && <BodyText tone="secondary">Shown as given.</BodyText>}
      <Button
        variant="secondary"
        size="xs"
        label={`Remove ${column.name === '' ? 'column' : column.name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}

function SortRow({
  item,
  names,
  disabled,
  onChange,
  onRemove,
}: {
  item: SortDraft;
  names: { value: string; label: string }[];
  disabled: boolean;
  onChange: (item: SortDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <Select
        label="Column"
        labelHidden
        value={item.name}
        options={names}
        disabled={disabled}
        onChange={(name) => onChange({ ...item, name })}
      />
      <Select
        label="Order"
        value={item.way}
        options={WAYS}
        disabled={disabled}
        onChange={(way) => onChange({ ...item, way: way === 'asc' ? 'asc' : 'desc' })}
      />
      <Button variant="secondary" size="xs" disabled={disabled} onClick={onRemove}>
        Remove
      </Button>
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
    <div>
      <Select
        label="Column"
        labelHidden
        value={item.name}
        options={names}
        disabled={disabled}
        onChange={(name) => onChange({ ...item, name })}
      />
      {kind !== 'text' && kind !== 'pick' && (
        <TextInput
          label="Decimal places"
          value={item.places}
          inputMode="decimal"
          disabled={disabled}
          placeholder="As given"
          onChange={(places) => onChange({ ...item, places })}
        />
      )}
      <Button variant="secondary" size="xs" disabled={disabled} onClick={onRemove}>
        Remove
      </Button>
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
    { enabled: entrant !== '' && board.who !== 'staff' && board.key !== '', retry: false },
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
        label="Preview as"
        value={entrant}
        options={options}
        placeholder="An entrant"
        disabled={disabled || options.length === 0}
        description={
          options.length === 0 ? 'Nobody has registered, so there is no row to preview.' : undefined
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
              <PreviewRow key={row.row.entrant} row={row} own={row.row.entrant === entrant} />
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
    <section aria-label="Hold" className={shared.stack}>
      <BodyText>Hold</BodyText>
      {locked && (
        <BodyText>The hold cannot be read. Set it again to replace it.</BodyText>
      )}
      <Checkbox
        label="Hold"
        checked={hold.on}
        disabled={disabled}
        description="From a time, other rows count only submissions made before it."
        onChange={(on) => onChange({ ...hold, on })}
      />
      {hold.on && (
        <>
          <FieldBox name="hold.from">
            <TimeField
              label="From"
              value={hold.from}
              disabled={disabled}
              onChange={(next) => onChange({ ...hold, from: next })}
            />
            <FieldMessages messages={from} />
            <Button
              variant="secondary"
              disabled={disabled || hour === ''}
              onClick={() => onChange({ ...hold, from: hour })}
            >
              An hour before the end
            </Button>
          </FieldBox>
          <FieldBox name="hold.until">
            <RadioGroup
              label="Until"
              value={hold.untilStaff ? 'staff' : 'time'}
              disabled={disabled}
              error={until[0]}
              options={[
                { value: 'staff', label: 'Until staff end it' },
                { value: 'time', label: 'Until a time' },
              ]}
              onChange={(value) => onChange({ ...hold, untilStaff: value === 'staff' })}
            />
            {!hold.untilStaff && (
              <TimeField
                label="Until"
                value={hold.until}
                disabled={disabled}
                onChange={(next) => onChange({ ...hold, until: next })}
              />
            )}
          </FieldBox>
        </>
      )}
    </section>
  );
}
