import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { BoxGraph } from '../flow/BoxGraph';
import { SMALL, TASK_PALETTE } from '../flow/graph';
import { FormulaLine, FormulaTiles } from './Editor';
import { flowOf, type FlowAbout } from './flow';
import { readLine } from './parse';
import { useFormulaTarget } from './target';
import { startersFor } from './examples';
import { Button } from '@/ui/Button';
import classes from './formula.module.css';

/** One formula, its controls, its tiles while written, and what it reads. */
export function FormulaCard({
  head,
  name,
  names,
  ...line
}: ComponentProps<typeof FormulaLine> & {
  head: ReactNode;
  name: string;
  names: ReadonlyMap<string, Omit<FlowAbout, 'name'>>;
}) {
  const [focused, setFocused] = useState(false);
  const target = useFormulaTarget();
  const scope = useMemo(
    () => ({
      ...line.scope,
      names: line.scope.names.filter(
        (item) => item !== name && line.scope.real?.[item] !== name,
      ),
    }),
    [line.scope, name],
  );
  const starters =
    line.value.trim() === '' && !line.disabled
      ? startersFor(scope, line.catalogue)
      : [];
  const reading = useMemo(
    () => readLine(line.value, scope, line.catalogue),
    [line.value, scope, line.catalogue],
  );
  const [last, setLast] = useState(reading.node);
  if (reading.node !== null && reading.node !== last) setLast(reading.node);
  const flow = flowOf(reading.node ?? last, names, {
    name,
    kind: line.value.trim() === '' ? 'empty' : (reading.kind ?? 'to fix'),
  });
  return (
    <Card>
      <div
        className={classes.card}
        data-formula-card
        data-focused={focused || undefined}
      >
        {head}
        <div
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}
        >
          <FormulaLine
            {...line}
            scope={scope}
            placeholder="Type, or click a tile below"
            onFocusLine={(insert) => {
              target.focus(name, insert);
              line.onFocusLine?.(insert);
            }}
          />
          {starters.length > 0 && (
            <div className={classes.starters}>
              {starters.map((starter) => (
                <Button
                  key={starter.name}
                  variant="secondary"
                  label={`${starter.name} ${starter.formula}`}
                  onClick={() => line.onChange(starter.formula)}
                >
                  <span>
                    {starter.name}
                    <code>{starter.formula}</code>
                  </span>
                </Button>
              ))}
            </div>
          )}
          {focused && !line.disabled && (
            <FormulaTiles
              scope={scope}
              names={names}
              catalogue={line.catalogue}
              target={name}
              onInsert={target.insert}
            />
          )}
        </div>
        <div
          className={classes.smallFlow}
          data-stale={reading.node === null || undefined}
        >
          {flow.wires.length === 0 ? (
            <BodyText size="sm" tone="secondary">
              Reads nothing: it is always the same.
            </BodyText>
          ) : (
            <BoxGraph
              {...flow}
              selected={null}
              shape={SMALL}
              palette={TASK_PALETTE}
              labels={false}
              floor={0}
              inside={() => null}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
