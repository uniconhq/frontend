import { useEffect, useRef, useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import {
  bothChanged,
  defaultSide,
  differences,
  mergeText,
  pathText,
  type Side,
} from './merge';
import { parseYaml } from './yaml-doc';
import shared from '../organise.module.css';
import classes from './forms.module.css';

/** A field's value as the merge view shows it. */
function shown(value: unknown): string {
  if (value === undefined) return 'not set';
  if (typeof value === 'string') return value === '' ? '""' : value;
  return JSON.stringify(value);
}

/**
 * What a save refused as a conflict turns into: the organiser's version and
 * the file as it is now, field by field, with a choice for each field they
 * disagree on. Each choice starts on the side that changed the field since
 * the organiser read it, and a field both changed is marked. Nothing is
 * written until Save, which writes the chosen fields into the current file,
 * so everything else of the current file stays, at its version.
 */
export function MergeView({
  baseText,
  mineText,
  currentText,
  busy,
  onSave,
  onDrop,
}: {
  /** The file as the organiser read it. */
  baseText: string;
  /** What the organiser tried to save. */
  mineText: string;
  /** The file as it is now. */
  currentText: string;
  busy: boolean;
  onSave: (content: string) => void;
  onDrop: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const base = parseYaml(baseText);
  const mine = parseYaml(mineText);
  const current = parseYaml(currentText);
  const diffs =
    'error' in current || 'error' in mine
      ? null
      : differences(
          'error' in base ? undefined : base.doc.toJS(),
          mine.doc.toJS(),
          current.doc.toJS(),
        );
  const [choices, setChoices] = useState<Side[]>(() => (diffs ?? []).map(defaultSide));

  return (
    <div ref={panel} className={shared.panel} role="alert" tabIndex={-1}>
      <BodyText>Someone else saved this file since you opened it.</BodyText>
      {diffs === null ? (
        <BodyText tone="secondary">
          Nothing was saved. The file as it is now is not YAML the form can read, so the
          two cannot be compared field by field. Drop your changes to see it, or edit it
          as text.
        </BodyText>
      ) : diffs.length === 0 ? (
        <BodyText tone="secondary">
          Nothing was saved, and nothing needs to be: the file as it is now already has
          every change you made.
        </BodyText>
      ) : (
        <>
          <BodyText tone="secondary">
            Nothing was saved yet. For each field the two versions disagree on, pick the
            one to keep, then save. Every other field stays as it is now.
          </BodyText>
          <ul className={classes.merge} aria-label="Fields that differ">
            {diffs.map((diff, index) => {
              const label = pathText(diff.path);
              return (
                <li key={label}>
                  <RadioGroup
                    label={bothChanged(diff) ? `${label} (both changed it)` : label}
                    value={choices[index] ?? 'theirs'}
                    options={[
                      { value: 'mine', label: `Yours: ${shown(diff.mine)}` },
                      { value: 'theirs', label: `Now: ${shown(diff.theirs)}` },
                    ]}
                    onChange={(value) =>
                      setChoices((before) =>
                        before.map((side, at) =>
                          at === index ? (value === 'mine' ? 'mine' : 'theirs') : side,
                        ),
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className={shared.actions}>
        {diffs !== null && diffs.length > 0 && (
          <Button
            size="xs"
            loading={busy}
            onClick={() => onSave(mergeText(currentText, diffs, choices))}
          >
            Save the merged version
          </Button>
        )}
        <Button size="xs" variant="secondary" disabled={busy} onClick={onDrop}>
          {diffs !== null && diffs.length === 0
            ? 'Back to the form'
            : 'Drop my changes'}
        </Button>
      </div>
    </div>
  );
}
