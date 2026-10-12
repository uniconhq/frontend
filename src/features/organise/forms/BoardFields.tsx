import { useState } from 'react';
import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Modal } from '@/ui/Modal';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import shared from '../organise.module.css';
import {
  boardRefusals,
  newBoard,
  type BoardValues,
  type OrderKeyValues,
} from './board-values';
import {
  boardSentence,
  KINDS,
  OVER,
  penaltyRefusal,
  perGroupRefusal,
  SELECT,
  WHO,
} from './board-words';
import { Fieldset, NumberField } from './fields';
import classes from './forms.module.css';

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

/** How many rows a viewer below the organisers sees, as the radio's choice. */
function rowsChoice(rows: string): 'all' | 'own' | 'top' {
  if (rows === '' || rows === 'all') return 'all';
  return rows === 'own' ? 'own' : 'top';
}

/**
 * The contest's leaderboards, each a box of fields in plain words with a
 * sentence that says what it ranks, added and removed here, removing asked
 * first, and written by one save. What the last save was refused for about
 * a board reads on the field that caused it. `disabled` shows them to
 * someone who may not change them.
 */
export function BoardFields({
  boards,
  taskIds,
  refused,
  onChange,
  disabled = false,
}: {
  boards: BoardValues[];
  taskIds: string[];
  refused: DefinitionError[];
  onChange: (boards: BoardValues[]) => void;
  disabled?: boolean;
}) {
  const change = (index: number, to: Partial<BoardValues>) =>
    onChange(boards.map((board, at) => (at === index ? { ...board, ...to } : board)));
  return (
    <>
      {boards.length === 0 ? (
        <BodyText>
          This contest has no leaderboards yet, so nobody sees a ranking.
          {disabled ? '' : ' Add one to rank its entrants.'}
        </BodyText>
      ) : (
        <ol className={classes.entries} aria-label="Leaderboards">
          {boards.map((board, index) => (
            <BoardEntry
              key={
                board.at === null ? `new-${String(index)}` : `at-${String(board.at)}`
              }
              board={board}
              index={index}
              taskIds={taskIds}
              refusals={boardRefusals(refused, index)}
              disabled={disabled}
              onChange={(to) => change(index, to)}
              onRemove={() => onChange(boards.filter((_, at) => at !== index))}
            />
          ))}
        </ol>
      )}
      {!disabled && (
        <div className={shared.actions}>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => onChange([...boards, newBoard()])}
          >
            Add a leaderboard
          </Button>
        </div>
      )}
    </>
  );
}

function BoardEntry({
  board,
  index,
  taskIds,
  refusals,
  disabled,
  onChange,
  onRemove,
}: {
  board: BoardValues;
  index: number;
  taskIds: string[];
  refusals: Map<string, string[]>;
  disabled: boolean;
  onChange: (to: Partial<BoardValues>) => void;
  onRemove: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const title = board.name === '' ? `Leaderboard ${String(index + 1)}` : board.name;
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
  const rows = rowsChoice(board.rows);
  const guests = board.who === 'everyone';
  const perGroup = perGroupRefusal(board.order);

  return (
    <li data-item={index}>
      <Fieldset legend={title}>
        <div className={shared.panel} role="status" aria-label={`What ${title} ranks`}>
          <BodyText>{boardSentence(board)}</BodyText>
        </div>
        {elsewhere.map(([key, messages]) => (
          <p key={key} className={classes.refused} role="alert">
            {messages.join(' ')}
          </p>
        ))}
        <div className={classes.grid}>
          <FieldBox name="name">
            <TextInput
              label="Name"
              value={board.name}
              onChange={(name) => onChange({ name })}
              description="Each leaderboard needs a name of its own."
              error={said('name')}
              disabled={disabled}
            />
          </FieldBox>
          <FieldBox name="who">
            <Select
              label="Shown to"
              value={board.who}
              options={choices(board.who, WHO)}
              placeholder="Organisers only, until chosen"
              onChange={(who) =>
                onChange({
                  who,
                  ...(who === 'everyone' && board.rows === 'own' && { rows: '' }),
                })
              }
              error={said('who')}
              disabled={disabled}
            />
          </FieldBox>
          <FieldBox name="over">
            <Select
              label="Counts"
              value={board.over === '' ? 'all' : board.over}
              options={choices(board.over, OVER)}
              onChange={(over) => onChange({ over: over === 'all' ? '' : over })}
              error={said('over')}
              disabled={disabled}
            />
          </FieldBox>
          <FieldBox name="select">
            <Select
              label="Which submission counts"
              value={board.select === '' ? 'best' : board.select}
              options={choices(board.select, SELECT).map((option) => ({
                ...option,
                disabled:
                  option.value === 'best_per_group' &&
                  perGroup !== null &&
                  board.select !== 'best_per_group',
              }))}
              description={perGroup ?? undefined}
              onChange={(select) =>
                onChange({ select: select === 'best' ? '' : select })
              }
              error={said('select')}
              disabled={disabled}
            />
          </FieldBox>
        </div>

        <FieldBox name="rows">
          <RadioGroup
            label="Rows an entrant sees"
            description={
              guests
                ? 'Visitors who have not entered have no row of their own, so a leaderboard everyone can see shows them every row.'
                : undefined
            }
            value={rows}
            options={[
              { value: 'all', label: 'All rows' },
              ...(guests ? [] : [{ value: 'own', label: 'Only their own row' }]),
              { value: 'top', label: 'The top rows' },
            ]}
            onChange={(choice) =>
              onChange({
                rows: choice === 'all' ? '' : choice === 'own' ? 'own' : '10',
              })
            }
            disabled={disabled}
          />
          {rows === 'top' && (
            <NumberField
              label="How many top rows"
              value={board.rows}
              onChange={(value) => onChange({ rows: value })}
              hint="Rows tied with the last one are shown too, and the entrant’s own row below them."
              error={said('rows')}
              whole
              disabled={disabled}
            />
          )}
        </FieldBox>

        <FieldBox name="tasks">
          <div role="group" aria-label="Tasks">
            <Checkbox
              label="Covers every task"
              checked={board.tasks === null}
              onChange={(every) => onChange({ tasks: every ? null : [...taskIds] })}
              disabled={disabled}
            />
            {board.tasks !== null &&
              shownTasks.map((task) => (
                <Checkbox
                  key={task}
                  label={task}
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
                  disabled={disabled}
                />
              ))}
            {tasksSaid !== undefined && (
              <p className={classes.refused} role="alert">
                {tasksSaid}
              </p>
            )}
          </div>
        </FieldBox>

        <FieldBox name="order">
          <div role="group" aria-label="Ranked by">
            {board.order.length === 0 ? (
              <BodyText tone="secondary">
                Ranked by points alone, unless you add another way to rank.
              </BodyText>
            ) : (
              <ol className={classes.entries}>
                {board.order.map((key, at) => (
                  <OrderKey
                    key={at}
                    label={at === 0 ? 'Ranked first by' : `Then by (${String(at + 1)})`}
                    of={title}
                    value={key}
                    first={at === 0}
                    last={at === board.order.length - 1}
                    error={said(`order.${String(at)}`)}
                    minutesError={said(`order.${String(at)}.per_attempt`)}
                    disabled={disabled}
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
            {!disabled && (
              <div className={shared.actions}>
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Add a way to rank ${title}`}
                  onClick={() =>
                    onChange({ order: [...board.order, { kind: 'points' }] })
                  }
                >
                  Add a way to rank
                </Button>
                <Button
                  size="xs"
                  variant="danger"
                  label={`Remove ${title}`}
                  onClick={() => setRemoving(true)}
                >
                  Remove this leaderboard
                </Button>
              </div>
            )}
          </div>
        </FieldBox>
        <Modal
          opened={removing}
          onClose={() => setRemoving(false)}
          title={`Remove ${title}?`}
        >
          <div className={shared.stack}>
            <BodyText>
              Once saved, nobody sees this ranking any more. Submissions and their
              points stay as they are.
            </BodyText>
            <div className={shared.actions}>
              <Button
                variant="danger"
                onClick={() => {
                  setRemoving(false);
                  onRemove();
                }}
              >
                Remove
              </Button>
              <Button variant="secondary" onClick={() => setRemoving(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </Fieldset>
    </li>
  );
}

function OrderKey({
  label,
  of,
  value,
  first,
  last,
  error,
  minutesError,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  /** The key's name in its board, such as "Ranked first by". */
  label: string;
  /** The board it belongs to, for its buttons' names. */
  of: string;
  value: OrderKeyValues;
  first: boolean;
  last: boolean;
  error: string | undefined;
  minutesError: string | undefined;
  disabled: boolean;
  onChange: (key: OrderKeyValues) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li className={classes.orderKey} role="group" aria-label={label}>
      <Select
        label={label}
        value={value.kind}
        options={KINDS.map((option) => ({
          ...option,
          disabled:
            option.value === 'penalty' &&
            penaltyRefusal(first) !== null &&
            value.kind !== 'penalty',
        }))}
        description={penaltyRefusal(first) ?? undefined}
        onChange={(kind) => onChange(keyOfKind(kind))}
        error={error}
        disabled={disabled}
      />
      {value.kind === 'value' && (
        <TextInput
          label="Value"
          value={value.name}
          onChange={(name) => onChange({ kind: 'value', name })}
          placeholder="Such as time_ms"
          description="Whether higher or lower is better is set by the workflow that reports it."
          disabled={disabled}
        />
      )}
      {value.kind === 'penalty' && (
        <NumberField
          label="Minutes per earlier attempt"
          value={value.perAttempt}
          onChange={(perAttempt) => onChange({ kind: 'penalty', perAttempt })}
          placeholder="0"
          info="Added for each earlier attempt at the task that does not count, on top of the minutes from the start to the submission that does."
          error={minutesError}
          whole
          disabled={disabled}
        />
      )}
      {!disabled && (
        <>
          <Button
            size="xs"
            variant="secondary"
            disabled={first}
            label={`Move ${label} of ${of} up`}
            onClick={() => onMove(-1)}
          >
            Up
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={last}
            label={`Move ${label} of ${of} down`}
            onClick={() => onMove(1)}
          >
            Down
          </Button>
          <Button
            size="xs"
            variant="secondary"
            label={`Remove ${label} of ${of}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </>
      )}
    </li>
  );
}
