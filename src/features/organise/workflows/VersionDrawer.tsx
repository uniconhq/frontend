import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { ListedVersionFile, SavedFolder } from '../files/FilePreview';
import type { VersionPlace } from '../files/place';
import type { BoxDecl } from './boxes';
import { Drawer } from './Drawer';
import { drawerTitle, type Selected } from './lines';
import type { Workflow } from './model';
import { FilePanel, InputsPanel, LockedPanel, OutputsPanel, StepPanel } from './Panels';
import { pinned } from './pins';
import type { PrimitiveInfo } from './primitives';
import type { Staging } from './staged-upload';
import { fileType } from './words';

const NO_PROBLEMS = pinned([], 0, [], []);
const NOTHING = () => undefined;
/** The version's own file, which View YAML on the bar shows. */
const WORKFLOW_FILE = ['workflow.yaml'];

/**
 * The drawer of a version's box: what the editor's drawer shows of it, the
 * fields locked, as a version never changes. A version passed every check
 * when it was published, so it has no problems to show. A workflow file's
 * box downloads the file, or each file of the folder, as the version holds it,
 * and Files on the bar lists every file of the version.
 */
export function VersionDrawer({
  owner,
  name,
  version,
  text,
  workflow,
  primitives,
  boxes,
  selected,
  onClose,
}: {
  owner: string;
  name: string;
  version: string;
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  selected: Selected | null;
  onClose: () => void;
}) {
  const staging: Staging = {
    place: { kind: 'workflow', owner, name },
    changes: [],
    onChange: NOTHING,
    onBusy: NOTHING,
    disabled: true,
  };
  const shared = { text, workflow, primitives, boxes, change: NOTHING };
  const place: VersionPlace = { kind: 'version', owner, name, version };
  const panel =
    selected === null ? null : selected.kind === 'step' ? (
      <StepPanel
        key={selected.index}
        {...shared}
        reading={false}
        pinned={NO_PROBLEMS}
        index={selected.index}
        fitting={() => []}
        onRemoved={NOTHING}
        onZoom={NOTHING}
      />
    ) : selected.kind === 'input' ? (
      <InputsPanel
        {...shared}
        pinned={NO_PROBLEMS}
        id={selected.id}
        files={[]}
        staging={staging}
        onRenamed={NOTHING}
        onGiven={NOTHING}
      />
    ) : selected.kind === 'files' ? null : selected.kind === 'file' ? (
      <FilePanel
        {...shared}
        path={selected.path}
        files={[]}
        listed={false}
        staging={staging}
        onMoved={NOTHING}
        onSupplied={NOTHING}
      />
    ) : (
      <OutputsPanel {...shared} pinned={NO_PROBLEMS} />
    );
  // Outside the locked panel, whose fields are disabled, so a folder opens.
  const downloads =
    selected?.kind === 'files' ? (
      <SavedFolder
        place={place}
        path=""
        title="Files"
        heading={`The files of ${version}`}
        leaveOut={WORKFLOW_FILE}
      />
    ) : selected?.kind !== 'file' ? null : fileType(selected.path) === 'folder' ? (
      <SavedFolder
        key={selected.path}
        place={place}
        path={selected.path.replace(/\/$/, '')}
      />
    ) : (
      <ListedVersionFile key={selected.path} place={place} path={selected.path} />
    );
  return (
    <Drawer title={drawerTitle(selected, workflow)} onClose={onClose}>
      {panel !== null && <LockedPanel>{panel}</LockedPanel>}
      {downloads}
    </Drawer>
  );
}

/** An owner can withdraw a version while every existing pin keeps grading. */
export function StopNewUse({ page, version }: { page: WorkflowPage; version: string }) {
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const client = useQueryClient();
  const stop = $api.useMutation(
    'post',
    '/api/v1/workflows/{owner}/{name}/versions/{version}/yank',
  );
  const undo = $api.useMutation(
    'delete',
    '/api/v1/workflows/{owner}/{name}/versions/{version}/yank',
  );
  const mark = page.yanked?.[version];
  const busy = stop.isPending || undo.isPending;
  const apply = async () => {
    setError(null);
    const params = { path: { owner: page.owner, name: page.name, version } };
    try {
      if (mark) await undo.mutateAsync({ params });
      else await stop.mutateAsync({ params, body: { reason: reason.trim() } });
      // The page, the list and the search each show which versions are withdrawn.
      await Promise.all(
        [
          $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}', {
            params: { path: { owner: page.owner, name: page.name } },
          }).queryKey,
          ['get', '/api/v1/workflows'],
          ['workflow-search'],
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
      setOpened(false);
    } catch (caught) {
      setError(toApiError(caught));
    }
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpened(true)}>
        {mark ? 'Allow new use' : 'Stop new use'}
      </Button>
      {opened && (
        <Modal
          opened
          onClose={() => setOpened(false)}
          title={mark ? 'Allow new use' : 'Stop new use'}
        >
          <BodyText>Tasks already pinned to {version} keep grading with it.</BodyText>
          {mark ? (
            <BodyText>{mark.reason}</BodyText>
          ) : (
            <TextInput label="Reason" value={reason} onChange={setReason} />
          )}
          {error && <ErrorBlock error={error} heading="Couldn’t change it" />}
          <Button
            loading={busy}
            disabled={!mark && reason.trim() === ''}
            onClick={() => void apply()}
          >
            {mark ? 'Allow new use' : 'Stop new use'}
          </Button>
        </Modal>
      )}
    </>
  );
}
