import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { FileContent, RollbackFile, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { CodeEditor, type CodeLanguage } from '@/ui/CodeEditor';
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
 * Why a file of a task is shown to read and not to edit: a test is changed
 * on the task's Tests and scoring card, and what is under `plans/` is the
 * platform's own, written at each save. Null for a file edited here.
 */
function readOnlyBecause(place: Place, path: string): string | null {
  if (place.kind !== 'task') return null;
  if (path.startsWith('tests/')) {
    return 'A test’s files are changed on the task’s page, in its Tests and scoring card.';
  }
  if (path.startsWith('plans/')) {
    return 'Unicon writes this file each time the task is saved, from its settings and its workflow.';
  }
  return null;
}

/** Bytes a base64 string decodes to, without decoding it. */
function decodedSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** What a file is highlighted as, by its ending. */
function languageOf(path: string): CodeLanguage {
  if (/\.ya?ml$/i.test(path)) return 'yaml';
  if (/\.md$/i.test(path)) return 'markdown';
  return 'plain';
}

/**
 * What a save sends: the file's text, or at a task, a rollback to one of its
 * versions. A refusal keeps it, so a confirmation sends the same again.
 */
type Sent = WriteFile | RollbackFile;

/**
 * One file, open as text in the code editor, or, for a file that is an
 * upload, shown as what it holds. The text is saved with the token it was read
 * with, so a file someone else changed in the meantime comes back as a
 * conflict and nothing is overwritten. That is why the file is read once,
 * under a key of its own, and never refetched behind the organiser's back,
 * not even when the live stream opens again (`EDITED`): a background
 * refetch would swap the token under text that was read at the old one. It
 * is read again after a save, and on Reload.
 *
 * From Save until that fresh read lands the text is read-only and Save is
 * busy: the read replaces the text with the file as saved, and a second save
 * would carry the old token. Nothing else makes it busy.
 *
 * The settings files, `contest.yaml` and `task.yaml`, are read here and edited only by an
 * admin while they do not read (SettingsText); a test's files and `plans/` are only read.
 * At a contest a save answers with the new version. At a task it is a save of
 * the task, which publishes or keeps a draft; the answer and the refusals are
 * SaveOutcome's, and the answer takes the focus. A task's file also has its
 * history below, from which a manager rolls it back to an older version; the
 * rollback is a save like any other, with the same token, answer and
 * refusals.
 */
export function FileEditor({ place, path }: { place: Place; path: string }) {
  const queryClient = useQueryClient();
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
  /** From Save until the file as saved is read back. */
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
      if (error.code === 'conflict' && 'content' in body) setConflict(body);
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
  const textEditor = (
    <TextEditor
      key={file.token}
      file={file}
      busy={busy}
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
  );

  return (
    <div className={classes.editor}>
      {file.upload ? (
        <UploadedFile
          place={place}
          path={file.path}
          upload={file.upload}
          token={file.token}
        />
      ) : path === settingsPath(place) ? (
        <SettingsText place={place} file={file} admin={admin} editor={textEditor} />
      ) : readOnlyBecause(place, path) !== null ? (
        <>
          <BodyText tone="secondary">{readOnlyBecause(place, path)}</BodyText>
          {file.encoding === 'utf-8' && (
            <CodeEditor
              label={path}
              value={file.content}
              language={languageOf(path)}
              rows={12}
              readOnly
            />
          )}
        </>
      ) : file.encoding === 'base64' ? (
        <>
          <BodyText mono>{file.path}</BodyText>
          <BodyText tone="secondary">
            This file is not text ({decodedSize(file.content)} bytes), so it cannot be
            edited here.
          </BodyText>
        </>
      ) : (
        textEditor
      )}
      {kept !== null && (
        <KeptText
          text={kept}
          language={languageOf(path)}
          onDone={() => setKept(null)}
        />
      )}
      {conflict !== null && (
        <TextConflict
          place={place}
          path={path}
          mine={conflict.content ?? ''}
          language={languageOf(path)}
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
          onConfirm={(body) => void save({ ...body, confirm: true })}
          onKeepAsDraft={(body) => void save({ ...body, keep_as_draft: true })}
          onReload={() => void reload()}
          placeOf={placeOfIn(place)}
        />
      )}
      {place.kind === 'task' && (
        <FileHistory
          place={place}
          path={path}
          language={languageOf(path)}
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
 * The text as it is being edited. Keyed by the token it was read at, so a
 * reload or a save's fresh read starts it again from the file, and nothing
 * else does: a refused save keeps every character typed.
 */
function TextEditor({
  file,
  busy,
  autoFocus,
  onSave,
}: {
  file: FileContent;
  busy: boolean;
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
        language={languageOf(file.path)}
        rows={18}
        readOnly={busy}
        autoFocus={autoFocus}
      />
      <div className={shared.actions}>
        <Button loading={busy} disabled={!changed} onClick={() => onSave(text)}>
          Save
        </Button>
        {changed && <UnsavedNote />}
      </div>
    </>
  );
}
