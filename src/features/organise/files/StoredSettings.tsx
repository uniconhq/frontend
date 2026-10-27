import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { FileContent, RollbackFile, WriteFile } from '@/api/types';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { CodeEditor } from '@/ui/CodeEditor';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { FileHistory } from './FileHistory';
import { fileQuery, settingsPath, staleAfterWrite, type Place } from './place';
import { SaveOutcome, type Outcome } from './SaveOutcome';
import { KeptText, TextConflict } from './TextConflict';
import { EDITED } from '@/live';
import { UploadedFile } from './UploadedFile';
import { SettingsText } from './SettingsText';
import { useMe } from '@/session';
import { holdsAt } from '../roles';
import { placeOfIn } from '../task/places';
import shared from '../organise.module.css';
import classes from './Files.module.css';

/**
 * What a save sends: the settings as text, or at a task, a rollback to one
 * of their versions. A refusal keeps it, so a confirmation sends the same
 * again.
 */
type Sent = WriteFile | RollbackFile;

/**
 * A place's settings as they are stored, `contest.yaml` or `task.yaml`, at
 * the foot of its Settings page: to read, with where they are changed and
 * every change to them (SettingsText); and, for an admin while the pages
 * cannot read them, as text to fix. The text is saved with the token it was
 * read with, so settings someone else changed in the meantime come back as a
 * conflict and nothing is overwritten. That is why they are read once, under
 * a key of their own, and never refetched behind the organiser's back, not
 * even when the live stream opens again (`EDITED`): a background refetch
 * would swap the token under text that was read at the old one. They are
 * read again after a save, and on Reload.
 *
 * From Save until that fresh read lands the text is read-only and Save is
 * busy: the read replaces the text with the settings as saved, and a second
 * save would carry the old token. Nothing else makes it busy.
 *
 * At a contest a save answers with the new version. At a task it is a save
 * of the task, which publishes or keeps a draft; the answer and the refusals
 * are SaveOutcome's, and the answer takes the focus. A task's settings also
 * have their history below, from which a manager rolls them back to an older
 * version; the rollback is a save like any other, with the same token,
 * answer and refusals.
 */
export function StoredSettings({ place }: { place: Place }) {
  const queryClient = useQueryClient();
  const path = settingsPath(place);
  const admin = holdsAt(useMe().roles, place, 'admin');
  const { queryKey, queryFn } = fileQuery(place, path);
  const query = useQuery({
    queryKey: [...queryKey, 'editor'],
    queryFn,
    meta: EDITED,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const view = queryView(query);

  const writeContest = $api.useMutation(
    'put',
    '/api/v1/orgs/{org}/contests/{contest}/files/{path}',
  );
  const writeTask = $api.useMutation(
    'put',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
  );
  const rollBackTask = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}/rollback',
  );
  /** From Save until the settings as saved are read back. */
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome<Sent> | null>(null);
  /** The text a save someone else's beat tried to write, while both are shown. */
  const [conflict, setConflict] = useState<WriteFile | null>(null);
  /** The organiser's own text, kept beside theirs to copy from once they go on from it. */
  const [kept, setKept] = useState<string | null>(null);
  /** Set by Reload, so the text read again takes the focus. */
  const [focusText, setFocusText] = useState(false);

  const save = async (body: Sent) => {
    setBusy(true);
    try {
      await send(body);
    } finally {
      setBusy(false);
    }
  };

  const send = async (body: Sent) => {
    setOutcome(null);
    setConflict(null);
    setFocusText(false);
    try {
      if (place.kind === 'task') {
        const params = {
          path: { org: place.org, contest: place.contest, task: place.task, path },
        };
        const result =
          'version' in body
            ? await rollBackTask.mutateAsync({ params, body })
            : await writeTask.mutateAsync({ params, body });
        setOutcome({ kind: 'saved', result });
      } else if (!('version' in body)) {
        const written = await writeContest.mutateAsync({
          params: { path: { org: place.org, contest: place.contest, path } },
          body,
        });
        setOutcome({ kind: 'written', version: written.version, notes: written.notes });
      }
    } catch (caught) {
      const error = toApiError(caught);
      // Going over theirs is another save, asked about again.
      if (error.code === 'conflict' && 'content' in body)
        setConflict({ ...body, confirm: false });
      else setOutcome({ kind: 'refused', error, body });
      return;
    }
    await Promise.all([
      ...staleAfterWrite(place).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
      query.refetch(),
    ]);
  };

  const reload = async () => {
    setOutcome(null);
    setFocusText(true);
    await query.refetch();
  };

  if (view.state === 'loading') return <PageSkeleton rows={6} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;

  const file = view.data;
  return (
    <div className={classes.editor}>
      {file.upload ? (
        <UploadedFile
          place={place}
          path={file.path}
          upload={file.upload}
          token={file.token}
        />
      ) : (
        <SettingsText
          place={place}
          file={file}
          admin={admin}
          editor={
            <TextEditor
              key={file.token}
              file={file}
              busy={busy}
              asking={
                outcome?.kind === 'refused' &&
                outcome.error.code === 'confirmation_required'
              }
              autoFocus={focusText}
              onSave={(content) =>
                void save({
                  content,
                  encoding: 'utf-8',
                  token: file.token,
                  confirm: false,
                  keep_as_draft: false,
                })
              }
            />
          }
        />
      )}
      {kept !== null && (
        <KeptText text={kept} language="yaml" onDone={() => setKept(null)} />
      )}
      {conflict !== null && (
        <TextConflict
          place={place}
          path={path}
          what="these settings"
          mine={conflict.content ?? ''}
          language="yaml"
          busy={busy}
          onTakeTheirs={() => {
            setKept(conflict.content ?? '');
            setConflict(null);
            void reload();
          }}
          onOverwrite={(theirs) => {
            setConflict(null);
            void save({ ...conflict, token: theirs.token });
          }}
        />
      )}
      {outcome !== null && (
        <SaveOutcome
          outcome={outcome}
          onConfirm={(body, asked) => void save({ ...body, confirm: true, asked })}
          onKeepAsDraft={
            place.kind === 'task'
              ? (body) => void save({ ...body, keep_as_draft: true })
              : undefined
          }
          onCancel={() => setOutcome(null)}
          onReload={() => void reload()}
          placeOf={placeOfIn(place)}
        />
      )}
      {place.kind === 'task' && (
        <FileHistory
          place={place}
          path={path}
          language="yaml"
          busy={busy}
          onRollBack={(version) =>
            save({ version, token: file.token, confirm: false, keep_as_draft: false })
          }
        />
      )}
    </div>
  );
}

/**
 * The settings as text being fixed. Keyed by the token they were read at,
 * so a reload or a save's fresh read starts it again from the file, and
 * nothing else does: a refused save keeps every character typed.
 */
function TextEditor({
  file,
  busy,
  asking,
  autoFocus,
  onSave,
}: {
  file: FileContent;
  busy: boolean;
  /**
   * Whether the save asks before it publishes: its answer sends the text as
   * it was asked about, so it stays so until answered.
   */
  asking: boolean;
  autoFocus: boolean;
  onSave: (content: string) => void;
}) {
  const [text, setText] = useState(file.content);
  const changed = text !== file.content;

  return (
    <>
      <CodeEditor
        label={file.path}
        value={text}
        onChange={setText}
        language="yaml"
        rows={18}
        readOnly={busy || asking}
        autoFocus={autoFocus}
      />
      <div className={shared.actions}>
        <Button
          loading={busy}
          disabled={!changed || asking}
          onClick={() => onSave(text)}
        >
          Save
        </Button>
        {changed && <UnsavedNote />}
      </div>
    </>
  );
}
