import type { WorkflowItem } from '@/api/types';
import { Select } from '@/ui/Select';
import { newestOf, naturally, refParts } from './build-data';
import classes from './task.module.css';

/** A version as the picker lists it: `v3`, and whether it is the newest. */
function versionLabel(version: string, newest: string | null): string {
  return version === newest ? `${version}, the newest` : version;
}

/**
 * Choosing a workflow and its version from those the organiser may read, in
 * place of typing its name: a task's Workflow card and New task both choose
 * one so. One already named that is not in the list, one they may not read,
 * stays chosen and listed.
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
  const usable = items.filter((item) => item.versions.length > 0);
  const item = usable.find((each) => named(each) === chosen);
  const versions = [...(item?.versions ?? [])].sort(naturally).reverse();
  if (parts !== null && !versions.includes(parts.version))
    versions.unshift(parts.version);
  const newest = item === undefined ? null : newestOf(item.versions);
  const workflows = usable.map((each) => ({ value: named(each), label: named(each) }));
  if (chosen !== '' && !workflows.some((each) => each.value === chosen)) {
    workflows.unshift({ value: chosen, label: `${chosen} (you may not read it)` });
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
        info="The workflow grades every submission: it says what entrants submit, what the task sets and what each test holds. The task keeps the version chosen here until another is chosen and saved."
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
