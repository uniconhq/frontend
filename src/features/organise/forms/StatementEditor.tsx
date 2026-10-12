import { useState } from 'react';
import { toApiError } from '@/api/problem';
import type { FileContent, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { Markdown } from '@/ui/Markdown';
import { CodeEditor } from '@/ui/CodeEditor';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { PageLink } from '@/ui/PageLink';
import { taskSectionPath } from '@/lib/sections';
import type { TaskWhere } from '@/lib/task-pictures';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { KeptText, TextConflict } from '../files/TextConflict';
import { UploadedFile } from '../files/UploadedFile';
import type { Place } from '../files/place';
import { placeOfIn } from '../task/places';
import shared from '../organise.module.css';
import { useFileWrite, useOwnFile } from './file-hooks';
import classes from './forms.module.css';

const PATH = 'statement.md';

/**
 * `statement.md`, the text contestants read, beside the same rendering their
 * task page gives it, the task's own pictures drawn as they will see them. The statement is the task admin's, so a manager reads
 * it here and changes nothing. A save is the save of the task, answered as
 * any other; one someone else's save beat shows both versions, as the
 * file editor does, and never swaps the text being edited for theirs. A
 * statement that is an upload shows as one, never as text.
 */
export function StatementEditor({ place, admin }: { place: Place; admin: boolean }) {
  const query = useOwnFile(place, PATH);
  const { write } = useFileWrite(place, PATH);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // From Save until the statement as saved is read back, the text is
  // read-only and Save spins: the read replaces the text, and a second save
  // would carry the old token. Nothing else makes it busy.
  const [saving, setSaving] = useState(false);
  /** The save someone else's beat, while both versions are shown. */
  const [conflict, setConflict] = useState<WriteFile | null>(null);
  /** The organiser's own text, kept beside theirs to copy from once they go on from it. */
  const [kept, setKept] = useState<string | null>(null);

  const send = async (body: WriteFile) => {
    setOutcome(null);
    setConflict(null);
    setSaving(true);
    try {
      const answer = await write(body);
      if (answer.kind === 'refused' && answer.error.code === 'conflict') {
        setConflict(body);
        return;
      }
      setOutcome(answer);
      if (answer.kind !== 'refused') await query.refetch();
    } finally {
      setSaving(false);
    }
  };

  if (query.isPending) return <PageSkeleton rows={6} />;
  if (query.data === undefined) {
    return (
      <ErrorBlock
        error={toApiError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.data.upload) {
    return (
      <UploadedFile
        place={place}
        path={PATH}
        upload={query.data.upload}
        token={query.data.token}
      />
    );
  }

  return (
    <div className={classes.form}>
      {!admin && (
        <BodyText tone="secondary">
          Only an admin of the task can change the statement.
        </BodyText>
      )}
      <Source
        key={query.data.token}
        file={query.data}
        task={
          place.kind === 'task'
            ? { org: place.org, contest: place.contest, task: place.task }
            : null
        }
        admin={admin}
        busy={saving}
        onSave={(content, token) =>
          void send({
            content,
            encoding: 'utf-8',
            token,
            confirm: false,
            keep_as_draft: false,
          })
        }
      />
      {kept !== null && (
        <KeptText text={kept} language="markdown" onDone={() => setKept(null)} />
      )}
      {conflict !== null && (
        <TextConflict
          place={place}
          path={PATH}
          mine={conflict.content ?? ''}
          language="markdown"
          busy={saving}
          onTakeTheirs={() => {
            setKept(conflict.content ?? '');
            setConflict(null);
            void query.refetch();
          }}
          onOverwrite={(theirs) => void send({ ...conflict, token: theirs.token })}
        />
      )}
      {outcome !== null && (
        <SaveOutcome
          outcome={outcome}
          onConfirm={(body) => void send({ ...body, confirm: true })}
          onKeepAsDraft={(body) => void send({ ...body, keep_as_draft: true })}
          onReload={() => {
            setOutcome(null);
            void query.refetch();
          }}
          placeOf={placeOfIn(place)}
        />
      )}
    </div>
  );
}

/** The source as it is being edited, kept through a refused save. */
function Source({
  file,
  task,
  admin,
  busy,
  onSave,
}: {
  file: FileContent;
  task: TaskWhere | null;
  admin: boolean;
  busy: boolean;
  onSave: (content: string, token: string) => void;
}) {
  const [text, setText] = useState(file.encoding === 'utf-8' ? file.content : '');
  const changed = text !== file.content;

  if (file.encoding !== 'utf-8') {
    return (
      <BodyText tone="secondary">{PATH} is not text, so it has no preview.</BodyText>
    );
  }

  return (
    <>
      <div className={classes.split}>
        <CodeEditor
          label="Statement source"
          value={text}
          onChange={setText}
          language="markdown"
          rows={18}
          readOnly={!admin || busy}
        />
        <section className={classes.preview} aria-label="What entrants see">
          <Markdown task={task ?? undefined}>{text}</Markdown>
        </section>
      </div>
      {admin && task !== null && <PictureHint task={task} />}
      {admin && (
        <div className={shared.actions}>
          <Button
            loading={busy}
            disabled={!changed}
            onClick={() => onSave(text, file.token)}
          >
            Save statement
          </Button>
          {changed && <UnsavedNote />}
        </div>
      )}
    </>
  );
}

/**
 * How a statement shows a picture: a file uploaded under the task's
 * `public/` folder, named by its path there. Anything else stays a link.
 */
function PictureHint({ task }: { task: TaskWhere }) {
  return (
    <BodyText tone="secondary">
      To show a picture, upload it in the task&apos;s{' '}
      <PageLink to={taskSectionPath(task.org, task.contest, task.task, 'files')}>
        Files
      </PageLink>{' '}
      under <code>public/</code> and write{' '}
      <code>![What it shows](public/diagram.png)</code>. A picture from anywhere else
      shows as a link.
    </BodyText>
  );
}
