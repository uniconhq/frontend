import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SaveChange, TreeEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { Progress } from '@/ui/Progress';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { SavedFile, SavedFolder } from '../files/FilePreview';
import { treeQuery } from '../files/place';
import { refsOf, type Workflow } from './model';
import { useStagedUpload, type StagedUpload, type Staging } from './staged-upload';
import { fileType } from './words';
import classes from './workflows.module.css';

/** The workflow's own file, which View YAML on the bar shows, not the Files drawer. */
const WORKFLOW_FILE = ['workflow.yaml'];

/** An upload's progress and what went wrong, under the control that started it. */
export function UploadProgress({
  state,
  error,
}: Pick<StagedUpload, 'state' | 'error'>) {
  return (
    <>
      {(state.stage === 'hashing' || state.stage === 'sending') && (
        <Progress
          value={Math.round(state.share * 100)}
          label={state.stage === 'hashing' ? 'Getting the file ready' : 'Uploading'}
        />
      )}
      {error !== null && <ErrorBlock error={error} compact />}
    </>
  );
}

/** The uploads and removals waiting for Save, each with a way to undo it. */
function Waiting({
  changes,
  locked,
  onChange,
}: {
  changes: SaveChange[];
  locked: boolean;
  onChange: Staging['onChange'];
}) {
  if (changes.length === 0) return null;
  return (
    <ul aria-label="File changes">
      {changes.map((change) => (
        <li key={change.path}>
          <BodyText>
            {change.path}:{' '}
            {change.remove ? 'removed on Save' : 'uploaded, waiting for Save'}
          </BodyText>
          <Button
            size="xs"
            variant="secondary"
            disabled={locked}
            onClick={() =>
              onChange((current) =>
                current.filter((entry) => entry.path !== change.path),
              )
            }
          >
            Undo {change.path}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Names as a sentence lists them: "a", "a and b", "a, b and c". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** The steps that read the file at `path`, by itself or in a folder they read. */
function stepsReading(workflow: Workflow, path: string): string[] {
  return workflow.steps
    .filter((step) =>
      Object.values(step.with).some((value) =>
        refsOf(value).some(
          (ref) =>
            ref.kind === 'workflow' &&
            (ref.name === path ||
              (ref.name.endsWith('/') && path.startsWith(ref.name))),
        ),
      ),
    )
    .map((step) => step.id);
}

/**
 * The drawer of every file of the workflow, opened from the bar: the files as
 * saved, a chosen one shown with Replace and Remove beside it; then the
 * changes waiting for the draft's Save; then Add files, which uploads each
 * file as it is dropped, into a folder when one is named beside it. They use
 * the task's preview and upload door. Removing a file a step reads asks
 * first, naming the steps, as they would read nothing.
 */
export function WorkflowFiles({
  workflow,
  ...staging
}: Staging & { workflow: Workflow }) {
  const { place, changes, onChange, disabled } = staging;
  const [folder, setFolder] = useState('');
  const [selected, setSelected] = useState<TreeEntry | null>(null);
  const [asking, setAsking] = useState(false);
  const { upload: send, state, error, busy } = useStagedUpload(staging);
  const locked = disabled || busy;
  const readers = selected === null ? [] : stepsReading(workflow, selected.path);

  const upload = (files: File[], replacing?: TreeEntry) =>
    void send(
      files,
      (file) =>
        replacing?.path ??
        [folder.trim().replace(/^\/+|\/+$/g, ''), file.webkitRelativePath || file.name]
          .filter(Boolean)
          .join('/'),
      replacing,
    );

  const remove = (entry: TreeEntry) => {
    setAsking(false);
    onChange((current) => [
      ...current.filter((change) => change.path !== entry.path),
      { path: entry.path, token: entry.token, encoding: 'utf-8', remove: true },
    ]);
  };

  return (
    <section className={classes.panel} aria-label="Files">
      <BodyText size="sm" tone="secondary">
        Programs and other files the steps read as workflow.&lt;path&gt;. Changes wait
        for Save, and a published version keeps the files as they were.
      </BodyText>
      <SavedFolder
        place={place}
        path=""
        title="Saved files"
        heading="Saved files"
        onChoose={(entry) => {
          setAsking(false);
          setSelected(entry);
        }}
        leaveOut={WORKFLOW_FILE}
      />
      {selected !== null && (
        <div className={classes.stack}>
          <FileDrop
            label={`Replace ${selected.path}`}
            files={[]}
            onChange={(files) => upload(files.slice(0, 1), selected)}
            disabled={locked}
          />
          {asking ? (
            <div role="alert" className={classes.stack}>
              <BodyText size="sm">
                {listed(readers)} {readers.length === 1 ? 'reads' : 'read'}{' '}
                {selected.path}, and would read nothing once it is removed.
              </BodyText>
              <div className={classes.actions}>
                <Button
                  size="xs"
                  variant="danger"
                  disabled={locked}
                  onClick={() => remove(selected)}
                >
                  Remove it anyway
                </Button>
                <Button size="xs" variant="secondary" onClick={() => setAsking(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                size="xs"
                variant="danger"
                disabled={locked || selected.token === null}
                onClick={() => {
                  if (readers.length > 0) setAsking(true);
                  else remove(selected);
                }}
              >
                Remove {selected.path}
              </Button>
            </div>
          )}
        </div>
      )}
      <Waiting changes={changes} locked={locked} onChange={onChange} />
      <div className={classes.addFiles}>
        <FileDrop
          label="Add files"
          description="Each uploads as it is dropped."
          files={[]}
          onChange={(files) => upload(files)}
          folder
          disabled={locked}
        />
        <TextInput
          label="Into folder (optional)"
          description="Such as scorer. Empty puts them at the top."
          value={folder}
          onChange={setFolder}
          disabled={locked}
        />
      </div>
      <UploadProgress state={state} error={error} />
    </section>
  );
}

/**
 * What the drawer of a file box holds of its file: the file as saved, an
 * upload waiting for Save in its place, and a way to upload it. A folder's
 * box lists the folder's files and takes more into it. A file a step reads is
 * not removed here, as the step would read nothing; Files on the toolbar
 * removes it.
 */
export function BoxFiles({ path, staging }: { path: string; staging: Staging }) {
  const { place, changes, onChange, disabled } = staging;
  const { upload, state, error, busy } = useStagedUpload(staging);
  const locked = disabled || busy;
  const folder = fileType(path) === 'folder';
  const at = path.replace(/\/$/, '');
  const parent = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '';
  const listing = useQuery(treeQuery(place, parent));
  const saved = listing.data?.find((entry) => entry.path === at) ?? null;
  const waiting = changes.filter((change) =>
    folder ? change.path.startsWith(`${at}/`) : change.path === at,
  );
  const name = at.slice(at.lastIndexOf('/') + 1);

  return (
    <div className={classes.stack}>
      {saved !== null &&
        (folder ? (
          <SavedFolder place={place} path={at} />
        ) : (
          <SavedFile
            place={place}
            path={at}
            size={saved.size}
            upload={saved.upload}
            listedAt={saved.version}
          />
        ))}
      {folder ? (
        <FileDrop
          label={`Add files to ${name}`}
          description="Each uploads as it is dropped."
          files={[]}
          folder
          disabled={locked}
          onChange={(files) =>
            void upload(
              files,
              (file) => `${at}/${file.webkitRelativePath || file.name}`,
            )
          }
        />
      ) : (
        <FileDrop
          label={saved === null ? `Upload ${name}` : `Replace ${name}`}
          files={[]}
          disabled={locked}
          onChange={(files) =>
            void upload(files.slice(0, 1), () => at, saved ?? undefined)
          }
        />
      )}
      <UploadProgress state={state} error={error} />
      <Waiting changes={waiting} locked={locked} onChange={onChange} />
    </div>
  );
}
