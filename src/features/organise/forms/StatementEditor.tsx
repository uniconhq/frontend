import { useState } from 'react';
import { toApiError } from '@/api/problem';
import type { FileContent, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Markdown } from '@/ui/Markdown';
import { CodeEditor } from '@/ui/CodeEditor';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { PageLink } from '@/ui/PageLink';
import { taskSectionPath } from '@/lib/sections';
import type { TaskWhere } from '@/lib/task-pictures';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
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
 * any other. A statement that is an upload shows as one, never as text.
 */
export function StatementEditor({ place, admin }: { place: Place; admin: boolean }) {
  const query = useOwnFile(place, PATH);
  const { write, pending } = useFileWrite(place, PATH);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const busy = pending || query.isFetching;

  const send = async (body: WriteFile) => {
    setOutcome(null);
    const answer = await write(body);
    setOutcome(answer);
    if (answer.kind !== 'refused') await query.refetch();
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
          Only an admin of the task changes the statement.
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
        busy={busy}
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
        <section className={classes.preview} aria-label="What contestants see">
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
          {changed && <BodyText tone="secondary">Unsaved changes</BodyText>}
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
