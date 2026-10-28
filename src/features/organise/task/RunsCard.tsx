import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { DeclaredInput } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ActionMenu, type MenuEntry } from '@/ui/ActionMenu';
import { InfoTip } from '@/ui/InfoTip';
import { Modal } from '@/ui/Modal';
import { FileDrop } from '@/ui/FileDrop';
import { IconButton } from '@/ui/IconButton';
import { TextInput } from '@/ui/TextInput';
import { SavedFile, SavedFolder } from '../files/FilePreview';
import { FieldBox } from '../contest/ContestFile';
import { FIELD_PARAM } from '../contest/places';
import {
  emptyTuple,
  runCount,
  settled,
  withoutInput,
  type AxisValues,
  type TupleValues,
} from '../forms/task-values';
import { BuildCard } from './BuildCard';
import { inputTitle, type TaskPlace } from './build-data';
import type { StagedInput } from './input-files';
import { useNamed } from './named-file';
import { runName } from './scoring-model';
import { cellPath, pairRunFiles } from './run-files';
import classes from './task.module.css';

function fieldName(table: number, row: number, name: string) {
  return `axis-${String(table)}-tuple-${String(row)}-${name}`;
}
const FILE = new Set(['file', 'folder']);
const LINE =
  'The tests a submission is run on. Each row is one run and what it is given. A submission runs once for every row, and Scoring adds up what the runs give.';
type Target = { table: number; row: number; input: string };
type ChooseFile = (target: Target, path: string, file: File) => void;

/** The changing inputs as lined-up tables, with uploads staged by the task’s save. */
export function RunsCard({
  active,
  place,
  declared,
  axes,
  staged,
  disabled,
  onChange,
  onFile,
  onDiscard,
}: {
  active: boolean;
  place: TaskPlace;
  declared: readonly DeclaredInput[];
  axes: AxisValues[];
  staged: StagedInput[];
  disabled: boolean;
  onChange: (axes: AxisValues[]) => void;
  onFile: ChooseFile;
  onDiscard: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const first = axes[0];
  const fileColumns =
    first?.inputs.filter((id) =>
      FILE.has(declared.find((input) => input.id === id)?.type ?? ''),
    ) ?? [];
  const pairing =
    first === undefined ? null : pairRunFiles(pending, first, fileColumns);
  const count = runCount(axes);
  const shown = axes.filter((axis) => axis.inputs.length > 0);
  const setAxis = (table: number, axis: AxisValues) =>
    onChange(axes.map((item, index) => (index === table ? axis : item)));
  const table = (axis: AxisValues, index: number) => (
    <div key={index}>
      <div className={classes.runTableFrame}>
        <table
          className={classes.runTable}
          aria-label={index === 0 ? 'Runs' : `Table ${String(index + 1)}`}
          style={{ minWidth: `${String(19 + axis.inputs.length * 14)}rem` }}
        >
          <thead>
            <tr>
              <th className={classes.runNumber}>#</th>
              <th className={classes.runName}>
                Name (optional){' '}
                <InfoTip about="Name">
                  Shown to entrants and in results in place of the file name.
                </InfoTip>
              </th>
              {axis.inputs.map((id) => {
                const input = declared.find((input) => input.id === id);
                return (
                  <th key={id}>
                    {input === undefined ? id : inputTitle(input)} ·{' '}
                    {input?.type === 'number'
                      ? 'a number'
                      : input?.type === 'file' || input?.type === 'folder'
                        ? 'a file'
                        : 'text'}
                    {input?.help && (
                      <InfoTip about={input.title ?? id}>{input.help}</InfoTip>
                    )}
                    {input === undefined && (
                      <>
                        <BodyText size="sm">Not an input of the workflow</BodyText>
                        {!disabled && (
                          <Button
                            size="xs"
                            variant="danger"
                            label={`Remove ${id}`}
                            onClick={() =>
                              onChange(
                                settled(
                                  axes.map((item, at) =>
                                    at === index ? withoutInput(item, id) : item,
                                  ),
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </>
                    )}
                  </th>
                );
              })}
              <th className={classes.runMenu} />
            </tr>
          </thead>
          <tbody>
            {axis.tuples.map((tuple, row) => (
              <RunsRow
                key={row}
                place={place}
                table={index}
                row={row}
                tuple={tuple}
                axis={axis}
                axes={axes}
                declared={declared}
                staged={staged}
                disabled={disabled}
                onChange={(next) =>
                  setAxis(index, {
                    ...axis,
                    tuples: axis.tuples.map((item, at) => (at === row ? next : item)),
                  })
                }
                onRemove={() => {
                  Object.values(tuple.cells).forEach((cell) => onDiscard(cell.value));
                  setAxis(index, {
                    ...axis,
                    tuples: axis.tuples.filter((_, at) => at !== row),
                  });
                }}
                onFile={onFile}
                onDiscard={onDiscard}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className={classes.runFoot}>
        {!disabled && (
          <Button
            variant="secondary"
            onClick={() =>
              setAxis(index, {
                ...axis,
                tuples: [...axis.tuples, emptyTuple(axis.inputs)],
              })
            }
          >
            Add a row
          </Button>
        )}
        <BodyText>
          {index === 0 && shown.length > 1
            ? `${shown.map((axis, at) => `${String(axis.tuples.length)}${at > 0 ? '' : axis.tuples.length === 1 ? ' row' : ' rows'}`).join(' × ')} = ${String(count)} ${count === 1 ? 'run' : 'runs'}`
            : `This makes ${String(index === 0 ? count : axis.tuples.length)} ${count === 1 ? 'run' : 'runs'}.`}
        </BodyText>
      </div>
    </div>
  );
  return (
    <BuildCard id="runs" title="Runs" line={LINE}>
      {!active ? (
        <BodyText>
          The runs are set here once the workflow can be read, as they give its inputs.
        </BodyText>
      ) : shown.length === 0 ? (
        <BodyText>
          A submission runs once, since nothing changes from run to run. To run it on
          several tests, set an input to 'You set one for each run' on the Inputs card.
        </BodyText>
      ) : (
        <>
          {fileColumns.length > 0 && !disabled && (
            <FileDrop
              label="Add files"
              layout="button"
              multiple
              files={pending}
              onChange={setPending}
              description="Drop many files at once. Files with the same name make one row (1.in and 1.ans), and the ending picks the column."
            />
          )}
          {pending.length > 0 && pairing !== null && (
            <div className={classes.item}>
              <h3 className={classes.itemTitle}>Where these files go</h3>
              <ul>
                {pairing.pairs.map((pair) => (
                  <li key={pair.file.name}>
                    {pair.file.name} → {pairing.axis.tuples[pair.row]?.title},{' '}
                    {declared.find((input) => input.id === pair.input)?.title ??
                      pair.input}
                  </li>
                ))}
              </ul>
              {pairing.problems.map((problem) => (
                <BodyText key={problem}>{problem}</BodyText>
              ))}
              <div className={classes.runFoot}>
                <Button
                  disabled={disabled || pairing.problems.length > 0}
                  onClick={() => {
                    if (first === undefined) return;
                    const next = {
                      ...pairing.axis,
                      tuples: pairing.axis.tuples.map((tuple, row) => ({
                        ...tuple,
                        cells: {
                          ...tuple.cells,
                          ...Object.fromEntries(
                            pairing.pairs
                              .filter((pair) => pair.row === row)
                              .map((pair) => [
                                pair.input,
                                first.tuples[row]?.cells[pair.input] ?? {
                                  entrant: false,
                                  value: '',
                                },
                              ]),
                          ),
                        },
                      })),
                    };
                    const nextAxes = axes.map((axis, index) =>
                      index === 0 ? next : axis,
                    );
                    const reserved = nextAxes.map((axis) => ({
                      ...axis,
                      tuples: axis.tuples.map((tuple) => ({
                        ...tuple,
                        cells: { ...tuple.cells },
                      })),
                    }));
                    onChange(nextAxes);
                    for (const pair of pairing.pairs) {
                      const path = cellPath(reserved, 0, pair.row, pair.input);
                      const tuple = reserved[0]?.tuples[pair.row];
                      if (tuple !== undefined)
                        tuple.cells[pair.input] = { entrant: false, value: path };
                      onFile(
                        { table: 0, row: pair.row, input: pair.input },
                        path,
                        pair.file,
                      );
                    }
                    setPending([]);
                  }}
                >
                  Add these
                </Button>
                <Button variant="secondary" onClick={() => setPending([])}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {first !== undefined && first.inputs.length > 0 && table(first, 0)}
          <details
            open={expanded}
            onToggle={(event) => setExpanded(event.currentTarget.open)}
          >
            <summary
              onClick={(event) => {
                event.preventDefault();
                const open = !expanded;
                setExpanded(open);
                if (open && axes.length < 2 && !disabled)
                  onChange([...axes, { inputs: [], tuples: [emptyTuple([])] }]);
              }}
            >
              Run each row more than once, with different settings
            </summary>
            <div className={classes.secondTable}>
              <h3 className={classes.itemTitle}>Each run also gets one of these</h3>
              <BodyText>Every row above runs once with every row here.</BodyText>
              {axes.slice(1).some((axis) => axis.inputs.length > 0) ? (
                axes
                  .slice(1)
                  .map((axis, index) =>
                    axis.inputs.length === 0 ? null : table(axis, index + 1),
                  )
              ) : (
                <BodyText>Choose its inputs on the Inputs card.</BodyText>
              )}
            </div>
          </details>
        </>
      )}
    </BuildCard>
  );
}

function RunsRow({
  place,
  table,
  row,
  tuple,
  axis,
  axes,
  declared,
  staged,
  disabled,
  onChange,
  onRemove,
  onFile,
  onDiscard,
}: {
  place: TaskPlace;
  table: number;
  row: number;
  tuple: TupleValues;
  axis: AxisValues;
  axes: AxisValues[];
  declared: readonly DeclaredInput[];
  staged: StagedInput[];
  disabled: boolean;
  onChange: (tuple: TupleValues) => void;
  onRemove: () => void;
  onFile: ChooseFile;
  onDiscard: (path: string) => void;
}) {
  const [sizeOpen, setSizeOpen] = useState(false);
  const [search, setSearch] = useSearchParams();
  const sizeField = fieldName(table, row, 'max_size');
  const requested = search.get(FIELD_PARAM) === sizeField;
  return (
    <>
      <tr>
        <td>{String(row + 1)}</td>
        <td>
          <FieldBox name={fieldName(table, row, 'title')}>
            <TextInput
              label={`Name of row ${String(row + 1)}`}
              labelHidden
              value={tuple.title}
              placeholder={runName({ ...tuple, title: '' }, [axis])}
              disabled={disabled}
              onChange={(title) => onChange({ ...tuple, title })}
            />
          </FieldBox>
        </td>
        {axis.inputs.map((id) => (
          <td key={id}>
            <FieldBox name={fieldName(table, row, id)}>
              <RunCell
                place={place}
                input={declared.find((input) => input.id === id)}
                id={id}
                row={row}
                cell={tuple.cells[id] ?? { entrant: false, value: '' }}
                limit={tuple.maxSize}
                disabled={disabled}
                staged={staged.find((file) => file.value === tuple.cells[id]?.value)}
                onChange={(cell) =>
                  onChange({ ...tuple, cells: { ...tuple.cells, [id]: cell } })
                }
                onFile={(file) =>
                  onFile(
                    { table, row, input: id },
                    cellPath(axes, table, row, id),
                    file,
                  )
                }
                onSize={() => setSizeOpen(true)}
                onDiscard={onDiscard}
              />
            </FieldBox>
          </td>
        ))}
        <td>
          {!disabled && (
            <IconButton
              sign="✕"
              label={`Remove row ${String(row + 1)}`}
              onClick={onRemove}
            />
          )}
        </td>
      </tr>
      <Modal
        opened={sizeOpen || requested}
        title={`Maximum size of row ${String(row + 1)}`}
        onClose={() => {
          setSizeOpen(false);
          if (requested) {
            const next = new URLSearchParams(search);
            next.delete(FIELD_PARAM);
            setSearch(next);
          }
        }}
      >
        <FieldBox name={sizeField}>
          <TextInput
            label={`Maximum size of row ${String(row + 1)}`}
            value={tuple.maxSize}
            placeholder="10MB"
            disabled={disabled}
            onChange={(maxSize) => onChange({ ...tuple, maxSize })}
            autoFocus
          />
        </FieldBox>
      </Modal>
    </>
  );
}

function RunCell({
  place,
  input,
  id,
  row,
  cell,
  limit,
  staged,
  disabled,
  onChange,
  onFile,
  onSize,
  onDiscard,
}: {
  place: TaskPlace;
  input: DeclaredInput | undefined;
  id: string;
  row: number;
  cell: { entrant: boolean; value: string };
  limit: string;
  staged: StagedInput | undefined;
  disabled: boolean;
  onChange: (cell: { entrant: boolean; value: string }) => void;
  onFile: (file: File) => void;
  onSize: () => void;
  onDiscard: (path: string) => void;
}) {
  const file = FILE.has(input?.type ?? '');
  const named = useNamed(
    place,
    !file || cell.entrant || staged !== undefined ? '' : cell.value,
  );
  const [viewing, setViewing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const planned = staged?.planned.find((change) => change.path === cell.value);
  const source =
    planned !== undefined && 'source' in planned ? planned.source : undefined;
  const name = source?.path ?? cell.value;
  const label = `File for row ${String(row + 1)} ${id}`;
  const drop = (compact: boolean) => (
    <FileDrop
      label={label}
      layout={compact ? 'compact' : undefined}
      folder={!compact && input?.type === 'folder'}
      files={[]}
      disabled={disabled}
      onChange={(files) => {
        const chosen = files[0];
        if (chosen !== undefined) {
          setReplacing(false);
          onFile(chosen);
        }
      }}
    />
  );
  const entries: MenuEntry[] = [
    ...(file && !cell.entrant
      ? [{ kind: 'item' as const, text: 'Replace', onSelect: () => setReplacing(true) }]
      : []),
    {
      kind: 'item',
      text: 'Remove',
      onSelect: () => {
        onDiscard(cell.value);
        onChange({ entrant: false, value: '' });
      },
    },
    {
      kind: 'item',
      text: cell.entrant ? 'You give this one' : 'The entrant gives this one',
      onSelect: () => {
        if (!cell.entrant) onDiscard(cell.value);
        onChange({
          entrant: !cell.entrant,
          value: staged === undefined ? cell.value : '',
        });
      },
    },
    ...(cell.entrant
      ? [{ kind: 'item' as const, text: 'Set the maximum size', onSelect: onSize }]
      : []),
  ];
  return (
    <>
      <div className={classes.runCell}>
        {cell.entrant ? (
          <span>
            The entrant gives it · up to{' '}
            {(limit || '10MB').replace(/([0-9])\s*([A-Za-z]+)/, '$1 $2')}
          </span>
        ) : file ? (
          cell.value === '' ? (
            drop(true)
          ) : (
            <>
              {staged === undefined && named != null ? (
                <Button
                  size="xs"
                  variant="secondary"
                  label={`View ${name}`}
                  onClick={() => setViewing(true)}
                >
                  {name}
                </Button>
              ) : (
                <span>{name}</span>
              )}
              {staged !== undefined && <Chip tone="live">New</Chip>}
            </>
          )
        ) : (
          <TextInput
            label={`${id} of row ${String(row + 1)}`}
            labelHidden
            value={cell.value}
            disabled={disabled}
            onChange={(value) => onChange({ entrant: false, value })}
          />
        )}
        {!disabled && (
          <ActionMenu
            text="✎"
            className={classes.cellMenu}
            label={`Actions for row ${String(row + 1)} ${id}`}
            entries={entries}
          />
        )}
      </div>
      <Modal opened={replacing} title={label} onClose={() => setReplacing(false)}>
        {drop(false)}
      </Modal>
      <Modal opened={viewing} title={name} onClose={() => setViewing(false)} wide>
        {named != null &&
          (named.kind === 'directory' ? (
            <SavedFolder place={place} path={named.path} />
          ) : (
            <SavedFile
              place={place}
              path={cell.value}
              size={named.size}
              upload={named.upload}
              listedAt={named.version}
            />
          ))}
      </Modal>
    </>
  );
}
