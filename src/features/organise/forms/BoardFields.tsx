import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import shared from '../organise.module.css';
import {
  boardRefusals,
  newBoard,
  type BoardValues,
  type OrderKeyValues,
} from './board-values';
import { Fieldset, NumberField } from './fields';
import classes from './forms.module.css';

const OVER = [
  { value: 'all', label: 'all: every group' },
  { value: 'live', label: 'live: the groups shown always or verdict' },
  { value: 'after_close', label: 'after_close: the groups shown after the close' },
];
const SELECT = [
  { value: 'best', label: 'best: the one ranking the row highest' },
  { value: 'best_per_group', label: 'best_per_group: the most points on each group' },
  { value: 'marked', label: 'marked: the best of those the row marked' },
];
const WHO = [
  { value: 'organisers', label: 'organisers: observers and above' },
  { value: 'contestants', label: 'contestants: approved contestants and organisers' },
  { value: 'everyone', label: 'everyone: anyone who may see the contest' },
];
const KINDS = [
  { value: 'points', label: 'points, higher is better' },
  { value: 'penalty', label: 'penalty, lower is better' },
  { value: 'value', label: 'a value the tasks report' },
];

/** The keys of a board that have a field of their own. */
const FIELDS = ['name', 'tasks', 'over', 'select', 'order', 'who', 'rows'];

function choices(value: string, options: { value: string; label: string }[]) {
  return value === '' || options.some((option) => option.value === value)
    ? options
    : [{ value, label: value }, ...options];
}

function keyOfKind(kind: string): OrderKeyValues {
  if (kind === 'penalty') return { kind: 'penalty', perAttempt: '' };
  if (kind === 'value') return { kind: 'value', name: '' };
  return { kind: 'points' };
}

/**
 * The contest's leaderboards, a field per key of each, added and removed
 * here and written by the same save as the rest of the file. What the last
 * save was refused for about a board reads on the field that caused it.
 */
export function BoardFields({
  boards,
  taskIds,
  refused,
  onChange,
}: {
  boards: BoardValues[];
  taskIds: string[];
  refused: DefinitionError[];
  onChange: (boards: BoardValues[]) => void;
}) {
  const change = (index: number, to: Partial<BoardValues>) =>
    onChange(boards.map((board, at) => (at === index ? { ...board, ...to } : board)));
  return (
    <>
      {boards.length === 0 ? (
        <BodyText tone="secondary">No leaderboards yet.</BodyText>
      ) : (
        <ol className={classes.entries} aria-label="Boards">
          {boards.map((board, index) => (
            <BoardEntry
              key={
                board.at === null ? `new-${String(index)}` : `at-${String(board.at)}`
              }
              board={board}
              index={index}
              taskIds={taskIds}
              refusals={boardRefusals(refused, index)}
              onChange={(to) => change(index, to)}
              onRemove={() => onChange(boards.filter((_, at) => at !== index))}
            />
          ))}
        </ol>
      )}
      <div className={shared.actions}>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => onChange([...boards, newBoard()])}
        >
          Add a board
        </Button>
      </div>
    </>
  );
}

function BoardEntry({
  board,
  index,
  taskIds,
  refusals,
  onChange,
  onRemove,
}: {
  board: BoardValues;
  index: number;
  taskIds: string[];
  refusals: Map<string, string[]>;
  onChange: (to: Partial<BoardValues>) => void;
  onRemove: () => void;
}) {
  const prefix = `Board ${String(index + 1)}`;
  const said = (...keys: string[]) => {
    const messages = keys.flatMap((key) => refusals.get(key) ?? []);
    return messages.length === 0 ? undefined : messages.join(' ');
  };
  const under = (field: string) =>
    [...refusals.keys()].filter((key) => key === field || key.startsWith(`${field}.`));
  const elsewhere = [...refusals].filter(
    ([key]) => !FIELDS.includes(key.split('.')[0] ?? ''),
  );
  const shownTasks = [
    ...taskIds,
    ...(board.tasks ?? []).filter((task) => !taskIds.includes(task)),
  ];
  const tasksSaid = said(...under('tasks'));
  const orderSaid = said('order');
  const setKey = (at: number, key: OrderKeyValues) =>
    onChange({ order: board.order.map((old, k) => (k === at ? key : old)) });
  const moveKey = (at: number, by: -1 | 1) => {
    const order = [...board.order];
    const [key] = order.splice(at, 1);
    if (key !== undefined) order.splice(at + by, 0, key);
    onChange({ order });
  };

  return (
    <li>
      <Fieldset legend={board.name === '' ? prefix : `${prefix}: ${board.name}`}>
        {elsewhere.map(([key, messages]) => (
          <p key={key} className={classes.refused} role="alert">
            {key === '' ? messages.join(' ') : `${key}: ${messages.join(' ')}`}
          </p>
        ))}
        <div className={classes.grid}>
          <TextInput
            label={`${prefix} name`}
            value={board.name}
            onChange={(name) => onChange({ name })}
            description="Unique among the contest's boards."
            error={said('name')}
          />
          <Select
            label={`${prefix} shown to`}
            value={board.who}
            options={choices(board.who, WHO)}
            placeholder="Not set (organisers)"
            onChange={(who) => onChange({ who })}
            error={said('who')}
          />
          <TextInput
            label={`${prefix} rows`}
            value={board.rows}
            onChange={(rows) => onChange({ rows })}
            description="all, own, or how many top rows. Empty: all."
            error={said('rows')}
          />
          <Select
            label={`${prefix} counts groups`}
            value={board.over}
            options={choices(board.over, OVER)}
            placeholder="Not set (all)"
            onChange={(over) => onChange({ over })}
            error={said('over')}
          />
          <Select
            label={`${prefix} counts which submission`}
            value={board.select}
            options={choices(board.select, SELECT)}
            placeholder="Not set (best)"
            onChange={(select) => onChange({ select })}
            error={said('select')}
          />
        </div>

        <div role="group" aria-label={`${prefix} tasks`}>
          <Checkbox
            label={`${prefix} covers every task`}
            checked={board.tasks === null}
            onChange={(every) => onChange({ tasks: every ? null : [...taskIds] })}
          />
          {board.tasks !== null &&
            shownTasks.map((task) => (
              <Checkbox
                key={task}
                label={`${prefix} covers ${task}`}
                checked={board.tasks?.includes(task) ?? false}
                onChange={(covered) =>
                  onChange({
                    tasks: covered
                      ? shownTasks.filter(
                          (id) => id === task || (board.tasks ?? []).includes(id),
                        )
                      : (board.tasks ?? []).filter((id) => id !== task),
                  })
                }
              />
            ))}
          {tasksSaid !== undefined && (
            <p className={classes.refused} role="alert">
              {tasksSaid}
            </p>
          )}
        </div>

        <div role="group" aria-label={`${prefix} ranks on`}>
          {board.order.length === 0 ? (
            <BodyText tone="secondary">Points alone, the default.</BodyText>
          ) : (
            <ol className={classes.entries}>
              {board.order.map((key, at) => (
                <OrderKey
                  key={at}
                  label={`${prefix} key ${String(at + 1)}`}
                  value={key}
                  first={at === 0}
                  last={at === board.order.length - 1}
                  error={said(`order.${String(at)}`)}
                  minutesError={said(`order.${String(at)}.per_attempt`)}
                  onChange={(to) => setKey(at, to)}
                  onMove={(by) => moveKey(at, by)}
                  onRemove={() =>
                    onChange({ order: board.order.filter((_, k) => k !== at) })
                  }
                />
              ))}
            </ol>
          )}
          {orderSaid !== undefined && (
            <p className={classes.refused} role="alert">
              {orderSaid}
            </p>
          )}
          <div className={shared.actions}>
            <Button
              size="xs"
              variant="secondary"
              label={`Add a key to ${prefix}`}
              onClick={() => onChange({ order: [...board.order, { kind: 'points' }] })}
            >
              Add a key
            </Button>
            <Button
              size="xs"
              variant="danger"
              label={`Remove ${prefix}`}
              onClick={onRemove}
            >
              Remove the board
            </Button>
          </div>
        </div>
      </Fieldset>
    </li>
  );
}

function OrderKey({
  label,
  value,
  first,
  last,
  error,
  minutesError,
  onChange,
  onMove,
  onRemove,
}: {
  label: string;
  value: OrderKeyValues;
  first: boolean;
  last: boolean;
  error: string | undefined;
  minutesError: string | undefined;
  onChange: (key: OrderKeyValues) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li className={classes.orderKey}>
      <Select
        label={label}
        value={value.kind}
        options={KINDS}
        onChange={(kind) => onChange(keyOfKind(kind))}
        error={error}
      />
      {value.kind === 'value' && (
        <TextInput
          label={`${label} value`}
          value={value.name}
          onChange={(name) => onChange({ kind: 'value', name })}
          description={
            value.name.trim() === ''
              ? 'Name the value, such as time_ms.'
              : 'Its direction is the value’s own.'
          }
        />
      )}
      {value.kind === 'penalty' && (
        <NumberField
          label={`${label} minutes per earlier attempt`}
          value={value.perAttempt}
          onChange={(perAttempt) => onChange({ kind: 'penalty', perAttempt })}
          hint="Each earlier attempt that does not count. Empty: 0."
          error={minutesError}
          whole
        />
      )}
      <Button
        size="xs"
        variant="secondary"
        disabled={first}
        label={`Move ${label} up`}
        onClick={() => onMove(-1)}
      >
        Up
      </Button>
      <Button
        size="xs"
        variant="secondary"
        disabled={last}
        label={`Move ${label} down`}
        onClick={() => onMove(1)}
      >
        Down
      </Button>
      <Button
        size="xs"
        variant="secondary"
        label={`Remove ${label}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </li>
  );
}
