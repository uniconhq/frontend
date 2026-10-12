import type { ReactNode } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Progress } from '@/ui/Progress';
import type { SaveState } from './build-save';
import classes from './task.module.css';

/**
 * The one save of the task's cards, in view at the foot of the window while
 * there is something to save: what changed, a line each, what the save will
 * do that the organiser should know first, and Save, which publishes the
 * task, or keeps it as a draft when it has problems. While larger files are
 * sent, how many have gone.
 */
export function SaveBar({
  lines,
  notices,
  problems,
  state,
  onSave,
  onDiscard,
  children,
}: {
  /** What changed, a line each. */
  lines: string[];
  /** What the save does that is worth knowing before it. */
  notices: string[];
  /** What keeps the cards from saving, such as a number field that holds no number. */
  problems: string[];
  state: SaveState;
  onSave: () => void;
  onDiscard: () => void;
  /** The last save's answer, under the bar. */
  children?: ReactNode;
}) {
  const busy = state.stage !== 'idle';
  if (lines.length === 0 && !busy && (children === undefined || children === false)) {
    return null;
  }
  return (
    <section className={classes.saveBar} aria-label="Save the task">
      {lines.length > 0 && (
        <>
          <BodyText>
            {lines.length === 1
              ? 'One change to save:'
              : `${String(lines.length)} changes to save:`}
          </BodyText>
          <ul className={classes.changes} aria-label="What changed">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {notices.map((notice) => (
        <BodyText key={notice}>{notice}</BodyText>
      ))}
      {problems.length > 0 && (
        <BodyText tone="secondary">Fix before saving: {problems.join(' ')}</BodyText>
      )}
      {state.stage === 'sending' && state.of > 0 && (
        <>
          <BodyText tone="secondary">
            Sending files: {state.sent} of {state.of}
          </BodyText>
          <Progress
            value={Math.round((state.sent / state.of) * 100)}
            label="Files sent"
          />
        </>
      )}
      {lines.length > 0 && (
        <div className={classes.statusLine}>
          <Button loading={busy} disabled={problems.length > 0} onClick={onSave}>
            Save
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onDiscard}>
            Discard changes
          </Button>
          <BodyText tone="secondary">
            Saving publishes the task; a save with problems is kept as a draft.
          </BodyText>
        </div>
      )}
      {children}
    </section>
  );
}
