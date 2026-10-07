import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { FileContent, RollbackFile, UploadInfo, WriteFile } from '@/api/types';
import { useMe } from '@/session';
import { formatSize } from '@/lib/size';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { CodeEditor, type CodeLanguage } from '@/ui/CodeEditor';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { holdsAt } from '../roles';
import { FileHistory } from './FileHistory';
import { fileQuery, staleAfterWrite, type Place } from './place';
import { SaveOutcome, type Outcome } from './SaveOutcome';
import { TaskUpload } from './TaskUpload';
import shared from '../organise.module.css';
import classes from './Files.module.css';

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
 * conflict and nothing is overwritten. That is why the file is read once and
 * never refetched behind the organiser's back: a background refetch would
 * swap the token under text that was read at the old one. It is read again
 * after a save, and on Reload.
 *
 * From Save until that fresh read lands the text is read-only and Save is
 * busy: the read replaces the text with the file as saved, and a second save
 * would carry the old token.
 *
 * At a contest a save answers with the new version. At a task it is a save of
 * the task, which publishes or keeps a draft; the answer and the refusals are
 * SaveOutcome's, and the answer takes the focus. A task's file also has its
 * history below, from which a manager rolls it back to an older version; the
 * rollback is a save like any other, with the same token, answer and
 * refusals.
 */
export function FileEditor({ place, path }: { place: Place; path: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...fileQuery(place, path),
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
  const busy =
    writeContest.isPending ||
    writeTask.isPending ||
    rollBackTask.isPending ||
    query.isFetching;
  const [outcome, setOutcome] = useState<Outcome<Sent> | null>(null);
  /** Set by Reload, so the text read again takes the focus. */
  const [focusText, setFocusText] = useState(false);

  const save = async (body: Sent) => {
    setOutcome(null);
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
        setOutcome({ kind: 'written', version: written.version });
      }
    } catch (caught) {
      setOutcome({ kind: 'refused', error: toApiError(caught), body });
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
        <UploadedFile place={place} file={file} upload={file.upload} />
      ) : file.encoding === 'base64' ? (
        <>
          <BodyText mono>{file.path}</BodyText>
          <BodyText tone="secondary">
            Binary, {decodedSize(file.content)} bytes. It cannot be edited as text.
          </BodyText>
        </>
      ) : (
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
      )}
      {outcome !== null && (
        <SaveOutcome
          outcome={outcome}
          onConfirm={(body) => void save({ ...body, confirm: true })}
          onKeepAsDraft={(body) => void save({ ...body, keep_as_draft: true })}
          onReload={() => void reload()}
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
 * A file that is an upload: what it holds, its size and SHA-256, and never
 * an editor, since its commit holds a pointer to the bytes and typing over it
 * would commit text where the pointer belongs. A manager of the task changes
 * it by uploading it again, at the same path, with the token it was read
 * with.
 */
function UploadedFile({
  place,
  file,
  upload,
}: {
  place: Place;
  file: FileContent;
  upload: UploadInfo;
}) {
  const roles = useMe().roles;
  const [again, setAgain] = useState(false);
  const manages = place.kind === 'task' && holdsAt(roles, place, 'manager');

  return (
    <section className={classes.editor} aria-label={`Uploaded ${file.path}`}>
      <BodyText mono>{file.path}</BodyText>
      <dl className={classes.facts}>
        <dt>Uploaded file</dt>
        <dd>
          {formatSize(upload.size)}
          {upload.size >= 1024 && ` (${upload.size.toLocaleString()} bytes)`}
        </dd>
        <dt>SHA-256</dt>
        <dd className={classes.digest}>{upload.digest}</dd>
      </dl>
      <BodyText tone="secondary">
        Its bytes are in the forge&apos;s store and its commit holds a pointer to them,
        so it does not open in the editor. To change it, upload it again.
      </BodyText>
      {manages && place.kind === 'task' && !again && (
        <div className={shared.actions}>
          <Button size="xs" variant="secondary" onClick={() => setAgain(true)}>
            Upload again
          </Button>
        </div>
      )}
      {place.kind === 'task' && again && (
        <TaskUpload
          place={place}
          again={{ path: file.path, token: file.token }}
          onClose={() => setAgain(false)}
        />
      )}
    </section>
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
        {changed && <BodyText tone="secondary">Unsaved changes</BodyText>}
      </div>
    </>
  );
}
