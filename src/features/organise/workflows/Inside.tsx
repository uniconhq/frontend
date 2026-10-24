import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Primitive } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { exactJS, parseYaml } from '../forms/yaml-doc';
import { parseUse, useBoxes, versionOptions, type Frame } from './boxes';
import { DrawnGraph } from './DrawnGraph';
import { readWorkflow } from './model';
import { byRef } from './primitives';
import classes from './workflows.module.css';

/**
 * A box opened from the workflow being edited, and any box opened from it.
 * Read only: the line above the graph is the way back.
 */
export function Inside({
  root,
  frames,
  primitives,
  onCrumb,
  onOpen,
}: {
  root: string;
  frames: Frame[];
  primitives: Primitive[];
  /** -1 is the workflow being edited; otherwise the frame to stop at. */
  onCrumb: (index: number) => void;
  onOpen: (frame: Frame) => void;
}) {
  const frame = frames[frames.length - 1];
  const read = useQuery({
    ...(frame === undefined
      ? versionOptions({ owner: '', name: '', version: '' })
      : versionOptions(frame.use)),
    enabled: frame !== undefined,
    retry: false,
  });
  const text = read.data?.content ?? null;
  const workflow = useMemo(() => {
    if (text === null) return null;
    const parsed = parseYaml(text);
    return readWorkflow('error' in parsed ? null : exactJS(parsed.doc));
  }, [text]);
  const uses = useMemo(() => {
    if (workflow === null) return [];
    const known = byRef(primitives);
    const found = [];
    for (const step of workflow.steps) {
      if (known.has(step.use)) continue;
      const parsed = parseUse(step.use);
      if (parsed !== null) found.push(parsed);
    }
    return found;
  }, [workflow, primitives]);
  const boxes = useBoxes(uses);
  if (frame === undefined) return null;
  const mark = frame.rest.length === 1 ? frame.rest[0] : null;
  const index = workflow?.steps.findIndex((step) => step.id === mark) ?? -1;
  return (
    <div className={classes.stack}>
      <nav className={classes.tools} aria-label="Where this box sits">
        <Button variant="secondary" onClick={() => onCrumb(-1)}>
          {root}
        </Button>
        {frames.map((item, at) => (
          <Button
            key={`${item.title}-${String(at)}`}
            variant="secondary"
            onClick={() => onCrumb(at)}
          >
            {item.title}
          </Button>
        ))}
      </nav>
      {read.isPending && <BodyText>Opening {frame.title}…</BodyText>}
      {read.isError && (
        <BodyText>
          {frame.use.owner}/{frame.use.name}@{frame.use.version} cannot be read.
        </BodyText>
      )}
      {text !== null && (
        <DrawnGraph
          text={text}
          primitives={primitives}
          boxes={boxes}
          selected={index >= 0 ? `step:${String(index)}` : null}
          onOpenBox={(opened) => {
            const step = workflow?.steps[opened];
            const use = step === undefined ? null : parseUse(step.use);
            if (step === undefined || use === null || byRef(primitives).has(step.use))
              return;
            onOpen({ use, title: step.id, rest: [] });
          }}
        />
      )}
    </div>
  );
}
