import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toApiError } from '@/api/problem';
import type { FileContent, TreeEntry, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { Markdown } from '@/ui/Markdown';
import { CodeEditor } from '@/ui/CodeEditor';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import type { TaskWhere } from '@/lib/task-pictures';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { KeptText, TextConflict } from '../files/TextConflict';
import { UploadedFile } from '../files/UploadedFile';
import { staleAfterWrite, treeQuery, type Place } from '../files/place';
import { sendToTask, tokenNow } from '../files/use-task-upload';
import { placeOfIn } from '../task/places';
import { fileChanges, type PlannedChange } from '../task/staged';
import { AddPicture } from './AddPicture';
import { StatementPictures } from './StatementPictures';
import shared from '../organise.module.css';
import { useFileWrite, useOwnFile } from './file-hooks';
import { picturesNamed, type StagedPicture } from './statement-pictures';
import classes from './forms.module.css';

const PATH = 'statement.md';

type TaskPlace = Extract<Place, { kind: 'task' }>;
type AddedPicture = Extract<StagedPicture, { kind: 'add' }>;

/**
 * The task's files under `public/`, its pictures, none while it has no such
 * folder; null while they are read. A file whose name starts with a dot,
 * such as the `.gitkeep` a task made before kept the folder with (M60), is
 * no picture and is left out.
 */
function usePublicFiles(place: Place): TreeEntry[] | null {
  const read = useQuery({ ...treeQuery(place, 'public'), retry: false });
  if (place.kind !== 'task') return [];
  if (read.isPending) return null;
  return (read.data ?? []).filter(
    (entry) => !(entry.path.split('/').at(-1) ?? '').startsWith('.'),
  );
}

/**
 * The statement and every picture staged with it as one save of the task
 * (`POST <task>/save`), a larger picture through the upload door, answered
 * as any save of the task is.
 */
async function saveWithPictures(
  task: TaskPlace,
  body: WriteFile,
  pictures: StagedPicture[],
): Promise<Outcome> {
  const planned: PlannedChange[] = [
    { path: PATH, token: body.token, text: body.content ?? '' },
    ...pictures.map((picture): PlannedChange => {
      const path = `public/${picture.name}`;
      if (picture.kind === 'remove')
        return { path, token: picture.token, remove: true };
      const { file } = picture;
      return {
        path,
        token: null,
        source: { path: file.name, size: file.size, read: () => Promise.resolve(file) },
      };
    }),
  ];
  const fileAt = (path: string) =>
    pictures.find(
      (picture): picture is AddedPicture =>
        picture.kind === 'add' && `public/${picture.name}` === path,
    )?.file;
  try {
    const changes = await fileChanges(planned, (path) => {
      const file = fileAt(path);
      if (file === undefined) throw new Error(`Nothing was chosen for ${path}.`);
      return sendToTask(task, file, path);
    });
    const { data } = await apiClient.POST(
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/save',
      {
        params: { path: { org: task.org, contest: task.contest, task: task.task } },
        body: {
          changes,
          confirm: body.confirm,
          asked: body.asked,
          keep_as_draft: body.keep_as_draft,
        },
      },
    );
    if (data === undefined) throw new Error('The save gave no answer.');
    return { kind: 'saved', result: data };
  } catch (caught) {
    return { kind: 'refused', error: toApiError(caught), body };
  }
}

/** Lets go of the addresses that drew chosen pictures from their own bytes. */
function letGo(pictures: StagedPicture[]) {
  for (const picture of pictures) {
    if (picture.kind === 'add') URL.revokeObjectURL(picture.url);
  }
}

/**
 * `statement.md`, the text contestants read, beside the same rendering their
 * task page gives it, the task's own pictures drawn as they will see them,
 * with the pictures under it and Add a picture (M51). A picture added or
 * taken out waits for the statement's save, drawn meanwhile from its own
 * bytes, and that one save writes the statement and every picture together,
 * answered as any save of the task, so a picture never publishes on its
 * own. The statement is the task admin's, so a manager reads it here and
 * changes nothing. One someone else's save beat shows both versions, as
 * the stored settings do, and never swaps the text being edited for
 * theirs. A statement that is an upload shows as one, never as text.
 */
export function StatementEditor({ place, admin }: { place: Place; admin: boolean }) {
  const query = useOwnFile(place, PATH);
  const { write } = useFileWrite(place, PATH);
  const queryClient = useQueryClient();
  const saved = usePublicFiles(place);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // From Save until the statement as saved is read back, the text is
  // read-only and Save spins: the read replaces the text, and a second save
  // would carry the old token. Nothing else makes it busy.
  const [saving, setSaving] = useState(false);
  /** The save someone else's beat, while both versions are shown. */
  const [conflict, setConflict] = useState<WriteFile | null>(null);
  /** The organiser's own text, kept beside theirs to copy from once they go on from it. */
  const [kept, setKept] = useState<string | null>(null);
  /** Pictures added or taken out, waiting for the statement's save. */
  const [pictures, setPictures] = useState<StagedPicture[]>([]);
  const staged = useRef(pictures);
  useEffect(() => {
    staged.current = pictures;
  }, [pictures]);
  useEffect(() => () => letGo(staged.current), []);

  const send = async (body: WriteFile) => {
    setOutcome(null);
    setConflict(null);
    setSaving(true);
    try {
      const sending = pictures;
      let answer: Outcome;
      if (place.kind === 'task' && sending.length > 0) {
        answer = await saveWithPictures(place, body, sending);
        if (answer.kind !== 'refused') {
          await Promise.all(
            staleAfterWrite(place).map((queryKey) =>
              queryClient.invalidateQueries({ queryKey }),
            ),
          );
        }
      } else {
        answer = await write(body);
      }
      if (answer.kind === 'refused' && answer.error.code === 'conflict') {
        // Going over theirs is another save, asked about again.
        setConflict({ ...body, confirm: false });
        return;
      }
      setOutcome(answer);
      if (answer.kind !== 'refused') {
        letGo(sending);
        setPictures([]);
        await query.refetch();
      }
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
        saved={saved}
        pictures={pictures}
        onPictures={(change) =>
          setPictures((before) => {
            const after = change(before);
            letGo(before.filter((picture) => !after.includes(picture)));
            return after;
          })
        }
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
          what="the statement"
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
          onConfirm={(body, asked) => void send({ ...body, confirm: true, asked })}
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

/** The source as it is being edited, kept through a refused save, and its pictures. */
function Source({
  file,
  task,
  admin,
  busy,
  saved,
  pictures,
  onPictures,
  onSave,
}: {
  file: FileContent;
  task: TaskWhere | null;
  admin: boolean;
  busy: boolean;
  /** The files under `public/` now, or null while they are read. */
  saved: TreeEntry[] | null;
  pictures: StagedPicture[];
  onPictures: (change: (before: StagedPicture[]) => StagedPicture[]) => void;
  onSave: (content: string, token: string) => void;
}) {
  const [text, setText] = useState(file.encoding === 'utf-8' ? file.content : '');
  const changed = text !== file.content || pictures.length > 0;
  const drawn = useMemo(
    () =>
      new Map(
        pictures.flatMap((picture) =>
          picture.kind === 'add' ? [[picture.name, picture.url] as const] : [],
        ),
      ),
    [pictures],
  );
  const taken = useMemo(
    () =>
      new Set([
        ...(saved ?? []).map((entry) => entry.path.slice('public/'.length)),
        ...pictures.map((picture) => picture.name),
      ]),
    [saved, pictures],
  );
  const named = useMemo(() => picturesNamed(text), [text]);
  const [removing, setRemoving] = useState<unknown>(null);

  if (file.encoding !== 'utf-8') {
    return (
      <BodyText tone="secondary">{PATH} is not text, so it has no preview.</BodyText>
    );
  }

  /** A picture under `public/` to take out at the save, with its token now. */
  const remove = (entry: TreeEntry) => {
    if (task === null) return;
    setRemoving(null);
    tokenNow({ kind: 'task', ...task }, entry.path)
      .then((token) => {
        if (token === null) return;
        const name = entry.path.slice('public/'.length);
        onPictures((before) => [...before, { kind: 'remove', name, token }]);
      })
      .catch((error: unknown) => setRemoving(error));
  };

  /** A change to the pictures put back; a picture added takes its line with it. */
  const undo = (name: string) => {
    const picture = pictures.find((found) => found.name === name);
    if (picture?.kind === 'add') {
      setText((before) =>
        before.replace(`\n\n${picture.line}\n`, '\n').replace(picture.line, ''),
      );
    }
    onPictures((before) => before.filter((found) => found.name !== name));
  };

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
          <Markdown task={task ?? undefined} staged={drawn}>
            {text}
          </Markdown>
        </section>
      </div>
      {task !== null && (
        <>
          {admin && (
            <BodyText tone="secondary">
              A picture shows where the statement has a line such as{' '}
              <code>![What it shows](public/diagram.png)</code>, for a picture saved
              with the task. &ldquo;Add a picture&rdquo; adds one and writes its line
              for you, and both are saved with the statement. A picture from anywhere
              else shows as a link.
            </BodyText>
          )}
          {saved !== null && (
            <StatementPictures
              saved={saved}
              staged={pictures}
              named={named}
              admin={admin}
              disabled={busy}
              onRemove={remove}
              onUndo={undo}
            />
          )}
          {removing !== null && <ErrorBlock error={toApiError(removing)} compact />}
          {admin && (
            <AddPicture
              taken={taken}
              disabled={busy || saved === null}
              onStaged={({ name, file: chosen, line }) => {
                setText((before) => `${before.replace(/\n*$/, '')}\n\n${line}\n`);
                onPictures((before) => [
                  ...before,
                  {
                    kind: 'add',
                    name,
                    file: chosen,
                    line,
                    url: URL.createObjectURL(chosen),
                  },
                ]);
              }}
            />
          )}
        </>
      )}
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
