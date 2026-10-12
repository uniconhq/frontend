import { useState } from 'react';
import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Modal } from '@/ui/Modal';
import { IconButton } from '@/ui/IconButton';
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
  type HeldGroup,
  OVER,
  penaltyRefusal,
  perGroupRefusal,
  SELECT,
  WHO,
} from './board-words';
import { Fieldset, NumberField } from './fields';
import {
  keyOfKind,
  kindDescription,
  kindOptions,
  nextKey,
  orderSummary,
  orderToWrite,
  repeatedValue,
  shownOrder,
} from './order-words';
import { numberProblem } from './yaml-doc';
import classes from './forms.module.css';

/** The keys of a board that have a field of their own. */
const FIELDS = ['name', 'tasks', 'over', 'select', 'order', 'who', 'rows'];

function choices(value: string, options: { value: string; label: string }[]) {
  return value === '' || options.some((option) => option.value === value)
    ? options
    : [{ value, label: value }, ...options];
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
  held = null,
  refused,
  onChange,
  disabled = false,
}: {
  boards: BoardValues[];
  taskIds: string[];
  /** The published tasks' groups whose results come out once their task closes, when known. */
  held?: HeldGroup[] | null;
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
              held={held}
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
  held,
  refusals,
  disabled,
  onChange,
  onRemove,
}: {
  board: BoardValues;
  index: number;
  taskIds: string[];
  held: HeldGroup[] | null;
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
  const rows = shownOrder(board.order);
  const writeOrder = (next: OrderKeyValues[]) =>
    onChange({ order: orderToWrite(board.order, next) });
  const setKey = (at: number, key: OrderKeyValues) =>
    writeOrder(rows.map((old, k) => (k === at ? key : old)));
  const moveKey = (at: number, by: -1 | 1) => {
    const order = [...rows];
    const [key] = order.splice(at, 1);
    if (key !== undefined) order.splice(at + by, 0, key);
    writeOrder(order);
  };
  const added = nextKey(rows);
  /** What is wrong with one way to rank: the save's refusal, or what it would refuse. */
  const keyProblem = (at: number): string | undefined => {
    const refusal = said(`order.${String(at)}`);
    if (refusal !== undefined) return refusal;
    const penaltyFirst = rows[at]?.kind === 'penalty' ? penaltyRefusal(at === 0) : null;
    return penaltyFirst ?? repeatedValue(rows, at) ?? undefined;
  };
  const shownRows = rowsChoice(board.rows);
  const guests = board.who === 'everyone';
  const perGroup = perGroupRefusal(board.order);

  return (
    <li data-item={index}>
      <Fieldset legend={title}>
        <div className={shared.panel} role="status" aria-label={`What ${title} ranks`}>
          <BodyText>{boardSentence(board, { held })}</BodyText>
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
        </div>
        <FieldBox name="who">
          <RadioGroup
            label="Shown to"
            value={board.who === '' ? 'organisers' : board.who}
            options={choices(board.who, WHO)}
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
          <RadioGroup
            label="Counts"
            value={board.over === '' ? 'all' : board.over}
            options={choices(board.over, OVER)}
            onChange={(over) => onChange({ over: over === 'all' ? '' : over })}
            error={said('over')}
            disabled={disabled}
          />
        </FieldBox>
        <FieldBox name="select">
          <RadioGroup
            label="Which submission counts"
            value={board.select === '' ? 'best' : board.select}
            options={choices(board.select, SELECT).map((option) => ({
              ...option,
              disabled:
                option.value === 'best_per_group' &&
                perGroup !== null &&
                board.select !== 'best_per_group',
              reason: option.value === 'best_per_group' ? perGroup : null,
            }))}
            onChange={(select) => onChange({ select: select === 'best' ? '' : select })}
            error={
              said('select') ??
              (board.select === 'best_per_group' ? (perGroup ?? undefined) : undefined)
            }
            disabled={disabled}
          />
        </FieldBox>

        <FieldBox name="rows">
          <RadioGroup
            label="Rows an entrant sees"
            description={
              guests
                ? 'Visitors who have not entered have no row of their own, so a leaderboard everyone can see shows them every row.'
                : undefined
            }
            value={shownRows}
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
          {shownRows === 'top' && (
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
          <div className={classes.checks} role="group" aria-label="Tasks">
            <span className={classes.checksLabel} aria-hidden>
              Tasks
            </span>
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
          <div className={classes.order} role="group" aria-label="Ranked by">
            <span className={classes.checksLabel} aria-hidden>
              Ranked by
            </span>
            <BodyText>{orderSummary(board.order)}</BodyText>
            <ol className={classes.orderRows}>
              {rows.map((key, at) => (
                <OrderKey
                  key={at}
                  at={at}
                  of={title}
                  value={key}
                  options={kindOptions(rows, at)}
                  last={at === rows.length - 1}
                  alone={rows.length === 1}
                  error={keyProblem(at)}
                  minutesError={said(`order.${String(at)}.per_attempt`)}
                  disabled={disabled}
                  onChange={(to) => setKey(at, to)}
                  onMove={(by) => moveKey(at, by)}
                  onRemove={() => writeOrder(rows.filter((_, k) => k !== at))}
                />
              ))}
            </ol>
            {orderSaid !== undefined && (
              <p className={classes.refused} role="alert">
                {orderSaid}
              </p>
            )}
            {!disabled && added !== null && (
              <div className={shared.actions}>
                <Button
                  size="xs"
                  variant="secondary"
                  label={`Add a way to rank ${title}`}
                  onClick={() => writeOrder([...rows, added])}
                >
                  Add a way to rank
                </Button>
              </div>
            )}
          </div>
        </FieldBox>
        {!disabled && (
          <div className={classes.foot}>
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
  at,
  of,
  value,
  options,
  last,
  alone,
  error,
  minutesError,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  /** Its place in the board's order, from 0. */
  at: number;
  /** The board it belongs to, for its buttons' names. */
  of: string;
  value: OrderKeyValues;
  /** The ways this row may take. */
  options: { value: string; label: string }[];
  last: boolean;
  /** Whether it is the board's only way to rank, which stays. */
  alone: boolean;
  error: string | undefined;
  minutesError: string | undefined;
  disabled: boolean;
  onChange: (key: OrderKeyValues) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const place = String(at + 1);
  const name = `Way to rank ${place}`;
  return (
    <li className={classes.orderRow} role="group" aria-label={name}>
      <span className={classes.orderNumber} aria-hidden>
        {place}
      </span>
      <div className={classes.orderBody}>
        <div className={classes.orderLine}>
          <Select
            label={name}
            labelHidden
            value={value.kind}
            options={options}
            onChange={(kind) => onChange(keyOfKind(kind))}
            disabled={disabled}
          />
          {value.kind === 'value' && (
            <TextInput
              label="Which value"
              labelHidden
              value={value.name}
              onChange={(text) => onChange({ kind: 'value', name: text })}
              placeholder="Its name, such as time_ms"
              disabled={disabled}
            />
          )}
          {value.kind === 'penalty' && (
            <span className={classes.minutes}>
              <TextInput
                label="Minutes per earlier attempt"
                labelHidden
                value={value.perAttempt}
                onChange={(perAttempt) => onChange({ kind: 'penalty', perAttempt })}
                placeholder="0"
                inputMode="decimal"
                error={minutesError ?? numberProblem(value.perAttempt, true)}
                disabled={disabled}
              />
              <span aria-hidden>minutes per earlier attempt</span>
            </span>
          )}
          {!disabled && (
            <span className={classes.orderButtons}>
              <IconButton
                sign="↑"
                label={`Move way to rank ${place} of ${of} up`}
                disabled={at === 0}
                onClick={() => onMove(-1)}
              />
              <IconButton
                sign="↓"
                label={`Move way to rank ${place} of ${of} down`}
                disabled={last}
                onClick={() => onMove(1)}
              />
              <IconButton
                sign="✕"
                label={`Remove way to rank ${place} of ${of}`}
                disabled={alone}
                onClick={onRemove}
              />
            </span>
          )}
        </div>
        <span className={classes.note}>{kindDescription(value.kind)}</span>
        {error !== undefined && (
          <p className={classes.refused} role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
