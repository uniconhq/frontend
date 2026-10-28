import { $api } from '@/api/query';
import type { WorkflowItem } from '@/api/types';
import { Select } from '@/ui/Select';
import { newestOf, naturally, refParts } from './build-data';
import classes from './task.module.css';

/** A version as the picker lists it: `v3`, and whether it is the newest. */
function versionLabel(version: string, newest: string | null): string {
  return version === newest ? `${version}, the newest` : version;
}

/**
 * The chosen workflow when the list leaves it out, as it leaves out another's
 * public workflow, which the marketplace lists: read by its name, and refused
 * when the organiser may not read it.
 */
function useUnlisted(parts: { owner: string; name: string } | null): {
  item: WorkflowItem | null;
  refused: boolean;
} {
  const page = $api.useQuery(
    'get',
    '/api/v1/workflows/{owner}/{name}',
    { params: { path: { owner: parts?.owner ?? '', name: parts?.name ?? '' } } },
    { enabled: parts !== null, retry: false, staleTime: 60_000 },
  );
  if (parts === null || page.data === undefined)
    return { item: null, refused: parts !== null && page.isError };
  const { owner, name, visibility, versions, editable } = page.data;
  return {
    item:
      versions.length === 0 ? null : { owner, name, visibility, versions, editable },
    refused: false,
  };
}

/**
 * Choosing a workflow and its version from those the organiser may read, in
 * place of typing its name: a task's Workflow card and New task both choose
 * one so. One already named that is not in the list stays chosen and
 * listed, with its versions when they may read it.
 */
export function WorkflowPicker({
  value,
  items,
  onChange,
  disabled = false,
}: {
  value: string;
  items: WorkflowItem[];
  onChange: (ref: string) => void;
  disabled?: boolean;
}) {
  const parts = refParts(value);
  const chosen = parts === null ? '' : `${parts.owner}/${parts.name}`;
  const named = (item: WorkflowItem) => `${item.owner}/${item.name}`;
  const listed = items.filter((item) => item.versions.length > 0);
  const unlisted = useUnlisted(
    parts !== null && !listed.some((each) => named(each) === chosen) ? parts : null,
  );
  const usable = unlisted.item === null ? listed : [unlisted.item, ...listed];
  const item = usable.find((each) => named(each) === chosen);
  const versions = [...(item?.versions ?? [])].sort(naturally).reverse();
  if (parts !== null && !versions.includes(parts.version))
    versions.unshift(parts.version);
  const newest = item === undefined ? null : newestOf(item.versions);
  const workflows = usable.map((each) => ({ value: named(each), label: named(each) }));
  if (chosen !== '' && !workflows.some((each) => each.value === chosen)) {
    workflows.unshift({
      value: chosen,
      label: unlisted.refused ? `${chosen} (you cannot see it)` : chosen,
    });
  }
  return (
    <div className={classes.grid}>
      <Select
        label="Workflow"
        value={chosen}
        options={workflows}
        placeholder="Choose a workflow"
        onChange={(next) => {
          const found = usable.find((each) => named(each) === next);
          const version = found === undefined ? null : newestOf(found.versions);
          if (version !== null) onChange(`${next}@${version}`);
        }}
        info="The workflow grades every submission: it says what entrants submit, what the task sets and what each run is given. The task keeps the version chosen here until another is chosen and saved."
        disabled={disabled}
      />
      <Select
        label="Version"
        value={parts?.version ?? ''}
        options={versions.map((version) => ({
          value: version,
          label: versionLabel(version, newest),
        }))}
        onChange={(version) => onChange(`${chosen}@${version}`)}
        disabled={disabled || chosen === ''}
      />
    </div>
  );
}
