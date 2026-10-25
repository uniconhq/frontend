import type { DeclaredInput } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { FileDrop } from '@/ui/FileDrop';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import {
  emptyTuple,
  runCount,
  type AxisValues,
  type TupleValues,
} from '../forms/task-values';
import { BuildCard } from './BuildCard';
import { inputTitle } from './build-data';
import classes from './task.module.css';

/** The path the editor gives a file uploaded for one cell. */
function runFilePath(axis: number, row: number, input: string): string {
  return `runs/${String(axis)}/${String(row)}/${input}`;
}

function fieldName(axis: number, row: number, name: string): string {
  return `axis-${String(axis)}-tuple-${String(row)}-${name}`;
}

const FILE = new Set(['file', 'folder']);

/**
 * One table per axis. A file cell takes an upload, named by the editor; a
 * scalar cell takes a value; any cell may be one the entrant gives. A tuple
 * may have a title, and one the entrant gives a part of a largest size.
 */
export function RunsCard({
  active,
  declared,
  axes,
  disabled,
  onChange,
  onFile,
}: {
  /** The workflow can be read. Otherwise the card waits for it, as its inputs are not known. */
  active: boolean;
  declared: readonly DeclaredInput[];
  axes: AxisValues[];
  disabled: boolean;
  onChange: (axes: AxisValues[]) => void;
  /** A file chosen for a cell. The path is the one the editor names. */
  onFile: (path: string, file: File) => void;
}) {
  if (!active) {
    return (
      <BuildCard
        id="runs"
        title="Runs"
        line="One row is one tuple. Axes are crossed, so two axes make a run for every pair."
      >
        <BodyText>
          The runs are set here once the workflow can be read, as they give its inputs.
        </BodyText>
      </BuildCard>
    );
  }
  const shown = axes.filter((axis) => axis.inputs.length > 0);
  const count = runCount(axes);
  const words =
    shown.length < 2
      ? `This makes ${String(count)} ${count === 1 ? 'run' : 'runs'}.`
      : `${shown.map((axis) => String(axis.tuples.length)).join(' × ')} = ${String(count)} runs.`;
  const setAxis = (index: number, axis: AxisValues) =>
    onChange(axes.map((item, at) => (at === index ? axis : item)));
  const setTuple = (index: number, row: number, tuple: TupleValues) => {
    const axis = axes[index];
    if (axis === undefined) return;
    setAxis(index, {
      ...axis,
      tuples: axis.tuples.map((item, at) => (at === row ? tuple : item)),
    });
  };

  return (
    <BuildCard
      id="runs"
      title="Runs"
      line="One row is one tuple. Axes are crossed, so two axes make a run for every pair."
    >
      {shown.length === 0 ? (
        <BodyText>No input is given once per run, so the task makes 1 run.</BodyText>
      ) : (
        shown.map((axis) => {
          const index = axes.indexOf(axis);
          const entrant = axis.tuples.some((tuple) =>
            axis.inputs.some((id) => tuple.cells[id]?.entrant === true),
          );
          return (
            <div key={axis.inputs.join('+')}>
              {shown.length > 1 && (
                <h3 className={classes.itemTitle}>Axis {String(index + 1)}</h3>
              )}
              <table className={classes.runs}>
                <thead>
                  <tr>
                    <th>Title</th>
                    {axis.inputs.map((id) => {
                      const found = declared.find((item) => item.id === id);
                      return (
                        <th key={id}>{found === undefined ? id : inputTitle(found)}</th>
                      );
                    })}
                    {entrant && <th>Largest size</th>}
                  </tr>
                </thead>
                <tbody>
                  {axis.tuples.map((tuple, row) => (
                    <tr key={row}>
                      <td>
                        <FieldBox name={fieldName(index, row, 'title')}>
                          <TextInput
                            label={`Title of row ${String(row + 1)}`}
                            labelHidden
                            value={tuple.title}
                            onChange={(title) =>
                              setTuple(index, row, { ...tuple, title })
                            }
                            disabled={disabled}
                          />
                        </FieldBox>
                      </td>
                      {axis.inputs.map((id) => {
                        const found = declared.find((item) => item.id === id);
                        const cell = tuple.cells[id] ?? { entrant: false, value: '' };
                        const file = FILE.has(found?.type ?? '');
                        return (
                          <td key={id}>
                            <FieldBox name={fieldName(index, row, id)}>
                              <Checkbox
                                label="The entrant gives it"
                                checked={cell.entrant}
                                onChange={(on) =>
                                  setTuple(index, row, {
                                    ...tuple,
                                    cells: {
                                      ...tuple.cells,
                                      [id]: { ...cell, entrant: on },
                                    },
                                  })
                                }
                                disabled={disabled}
                              />
                              {!cell.entrant &&
                                (file ? (
                                  <div>
                                    <BodyText size="sm">
                                      {cell.value === '' ? 'No file' : cell.value}
                                    </BodyText>
                                    <FileDrop
                                      label={`File for row ${String(row + 1)} ${id}`}
                                      folder={found?.type === 'folder'}
                                      files={[]}
                                      onChange={(files) => {
                                        const chosen = files[0];
                                        if (chosen !== undefined)
                                          onFile(runFilePath(index, row, id), chosen);
                                      }}
                                      disabled={disabled}
                                    />
                                  </div>
                                ) : (
                                  <TextInput
                                    label={`${id} of row ${String(row + 1)}`}
                                    labelHidden
                                    value={cell.value}
                                    onChange={(value) =>
                                      setTuple(index, row, {
                                        ...tuple,
                                        cells: {
                                          ...tuple.cells,
                                          [id]: { entrant: false, value },
                                        },
                                      })
                                    }
                                    disabled={disabled}
                                  />
                                ))}
                            </FieldBox>
                          </td>
                        );
                      })}
                      {entrant && (
                        <td>
                          <FieldBox name={fieldName(index, row, 'max_size')}>
                            <TextInput
                              label={`Largest size of row ${String(row + 1)}`}
                              labelHidden
                              value={tuple.maxSize}
                              onChange={(maxSize) =>
                                setTuple(index, row, { ...tuple, maxSize })
                              }
                              placeholder="10MB"
                              disabled={disabled}
                            />
                          </FieldBox>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() =>
                  setAxis(index, {
                    ...axis,
                    tuples: [...axis.tuples, emptyTuple(axis.inputs)],
                  })
                }
              >
                Add a row
              </Button>
            </div>
          );
        })
      )}
      <BodyText>{words}</BodyText>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => onChange([...axes, { inputs: [], tuples: [emptyTuple([])] }])}
      >
        Add an axis
      </Button>
    </BuildCard>
  );
}
