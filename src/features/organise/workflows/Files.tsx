import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { SaveChange, TreeEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FileDrop } from '@/ui/FileDrop';
import { Progress } from '@/ui/Progress';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { SavedFolder } from '../files/FilePreview';
import type { WorkflowPlace } from '../files/place';
import { sendToTask, tokenNow, type UploadState } from '../files/use-task-upload';
import classes from './workflows.module.css';

/** A workflow's files use the task's preview and upload door, then wait for the draft's Save. */
export function WorkflowFiles({
  place,
  changes,
  onChange,
  disabled,
  onBusy,
}: {
  place: WorkflowPlace;
  changes: SaveChange[];
  onChange: (changes: SaveChange[]) => void;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState('');
  const [chosen, setChosen] = useState<File[]>([]);
  const [selected, setSelected] = useState<TreeEntry | null>(null);
  const [state, setState] = useState<UploadState>({ stage: 'idle' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState(0);
  const locked = disabled || busy;

  const upload = async (files: File[], replacing?: TreeEntry) => {
    if (locked || files.length === 0) return;
    setBusy(true);
    onBusy(true);
    setError(null);
    const staged = [...changes];
    try {
      for (const file of files) {
        const path =
          replacing?.path ??
          [folder.replace(/\/$/, ''), file.webkitRelativePath || file.name]
            .filter(Boolean)
            .join('/');
        const before = staged.find((change) => change.path === path);
        const token =
          before !== undefined
            ? before.token
            : replacing !== undefined
              ? replacing.token
              : await tokenNow(place, path);
        const id = await sendToTask(place, file, path, setState);
        const at = staged.findIndex((change) => change.path === path);
        const change: SaveChange = {
          path,
          token,
          upload: id,
          encoding: 'utf-8',
          remove: false,
        };
        if (at < 0) staged.push(change);
        else staged[at] = change;
        // A later failed file keeps the earlier uploads ready to save.
        onChange([...staged]);
      }
      setChosen([]);
      setState({ stage: 'idle' });
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  const reload = async () => {
    await queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}/tree', {
        params: { path: { owner: place.owner, name: place.name } },
      }).queryKey,
    });
    setSelected(null);
    setTree((before) => before + 1);
  };

  return (
    <section aria-label="Files">
      <Card>
        <div className={classes.stack}>
          <SectionTitle>Files</SectionTitle>
          <BodyText tone="secondary">
            Programs and other files the steps read as workflow.&lt;path&gt;. Uploads
            and removals wait for Save. A published version includes these files.
          </BodyText>
          <TextInput
            label="Folder"
            description="Where to put new files, such as scorer. Leave empty for the top folder."
            value={folder}
            onChange={setFolder}
            disabled={locked}
          />
          <FileDrop
            label="Add files"
            files={chosen}
            onChange={setChosen}
            folder
            disabled={locked}
          />
          <div className={classes.actions}>
            <Button
              disabled={locked || chosen.length === 0}
              loading={busy}
              onClick={() => void upload(chosen)}
            >
              Upload files
            </Button>
            <Button variant="secondary" disabled={locked} onClick={() => void reload()}>
              Reload files
            </Button>
          </div>
          {(state.stage === 'hashing' || state.stage === 'sending') && (
            <Progress
              value={Math.round(state.share * 100)}
              label={state.stage === 'hashing' ? 'Getting the file ready' : 'Uploading'}
            />
          )}
          {error !== null && <ErrorBlock error={error} compact />}
          {changes.length > 0 && (
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
                      onChange(changes.filter((entry) => entry.path !== change.path))
                    }
                  >
                    Undo {change.path}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <SavedFolder
            key={tree}
            place={place}
            path=""
            title="Saved files"
            heading="Saved files"
            onChoose={setSelected}
          />
          {selected !== null && selected.path !== 'workflow.yaml' && (
            <div className={classes.stack}>
              <FileDrop
                label={`Replace ${selected.path}`}
                files={[]}
                onChange={(files) => void upload(files, selected)}
                disabled={locked}
              />
              <div>
                <Button
                  variant="danger"
                  disabled={locked || selected.token === null}
                  onClick={() => {
                    onChange([
                      ...changes.filter((entry) => entry.path !== selected.path),
                      {
                        path: selected.path,
                        token: selected.token,
                        encoding: 'utf-8',
                        remove: true,
                      },
                    ]);
                  }}
                >
                  Remove {selected.path}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
