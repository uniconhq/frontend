import { SavedFolder, VersionFile } from '../files/FilePreview';
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
      <VersionFile key={selected.path} place={place} path={selected.path} size={null} />
    );
  return (
    <Drawer title={drawerTitle(selected, workflow)} onClose={onClose}>
      {panel !== null && <LockedPanel>{panel}</LockedPanel>}
      {downloads}
    </Drawer>
  );
}
