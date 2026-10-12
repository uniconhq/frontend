import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryView } from '@/api/query';
import type { FileContent } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CodeEditor, type CodeLanguage } from '@/ui/CodeEditor';
import { Modal } from '@/ui/Modal';
import { Loaded } from '@/ui/feedback/Loaded';
import { fileQuery, type Place } from './place';
import shared from '../organise.module.css';
import classes from './Files.module.css';

/**
 * The organiser's own text from a save someone else's beat, kept read-only
 * beside their version once the organiser goes on from it, to copy from.
 */
export function KeptText({
  text,
  language,
  onDone,
}: {
  text: string;
  language: CodeLanguage;
  onDone: () => void;
}) {
  return (
    <div className={shared.stack}>
      <CodeEditor
        label="Your text from before, to copy from"
        value={text}
        language={language}
        rows={10}
        readOnly
      />
      <div className={shared.actions}>
        <Button size="xs" variant="secondary" onClick={onDone}>
          Done with it
        </Button>
      </div>
    </div>
  );
}

/**
 * What a save of a text file someone else saved first turns into: both
 * versions side by side, theirs as it is now and the organiser's, nothing
 * saved yet. They go on from theirs, keeping their own text beside it to
 * copy what they want across, which merges the two by hand; or save theirs
 * over, after a warning that it throws away the other person's change. A
 * form's settings merge field by field instead (MergeView).
 */
export function TextConflict({
  place,
  path,
  what,
  mine,
  language,
  busy,
  onOverwrite,
  onTakeTheirs,
}: {
  place: Place;
  path: string;
  /** What the text is, as the page names it: "the statement", "these settings". */
  what: string;
  /** What the organiser tried to save. */
  mine: string;
  language: CodeLanguage;
  busy: boolean;
  /** Save `mine` over their version, read with the token it is now at. */
  onOverwrite: (theirs: FileContent) => void;
  onTakeTheirs: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [warning, setWarning] = useState(false);
  const { queryKey, queryFn } = fileQuery(place, path);
  const theirs = queryView(
    useQuery({ queryKey: [...queryKey, 'theirs'], queryFn, staleTime: 0, gcTime: 0 }),
  );
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div ref={panel} className={shared.panel} role="alert" tabIndex={-1}>
      <BodyText>Someone else changed {what} since you opened it.</BodyText>
      <BodyText tone="secondary">
        Nothing was saved. Their version is on the left and yours on the right. Continue
        from theirs and copy in what you want to keep of yours, or save yours over
        theirs.
      </BodyText>
      <Loaded view={theirs} rows={6}>
        {(file) => (
          <>
            <div className={classes.sides}>
              <CodeEditor
                label="Their version, as it is now"
                value={file.encoding === 'utf-8' ? file.content : ''}
                language={language}
                rows={12}
                readOnly
              />
              <CodeEditor
                label="Your version"
                value={mine}
                language={language}
                rows={12}
                readOnly
              />
            </div>
            <div className={shared.actions}>
              <Button onClick={onTakeTheirs}>Continue from theirs</Button>
              <Button variant="danger" disabled={busy} onClick={() => setWarning(true)}>
                Save yours over theirs
              </Button>
            </div>
            <Modal
              opened={warning}
              onClose={() => setWarning(false)}
              title="Save yours over theirs?"
            >
              <div className={shared.stack}>
                <BodyText>
                  Their change to {what} is thrown away, and yours is saved in its
                  place. Theirs is still kept among the earlier versions.
                </BodyText>
                <div className={shared.actions}>
                  <Button
                    variant="danger"
                    loading={busy}
                    onClick={() => {
                      setWarning(false);
                      onOverwrite(file);
                    }}
                  >
                    Save yours over theirs
                  </Button>
                  <Button variant="secondary" onClick={() => setWarning(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Modal>
          </>
        )}
      </Loaded>
    </div>
  );
}
