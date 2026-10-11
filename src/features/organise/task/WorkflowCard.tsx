import { queryView } from '@/api/query';
import type { WorkflowItem } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { PageLink } from '@/ui/PageLink';
import { Select } from '@/ui/Select';
import { Loaded } from '@/ui/feedback/Loaded';
import { workflowPath } from '@/lib/organiser-paths';
import { FieldBox } from '../contest/ContestFile';
import { DrawnGraph } from '../workflows/DrawnGraph';
import { BuildCard } from './BuildCard';
import {
  newestOf,
  naturally,
  refParts,
  usePrimitives,
  useWorkflowList,
  useWorkflowVersion,
} from './build-data';
import shared from '../organise.module.css';
import classes from './task.module.css';

/** A version as the picker lists it: `v3`, and whether it is the newest. */
function versionLabel(version: string, newest: string | null): string {
  return version === newest ? `${version}, the newest` : version;
}

/** The workflow named, as the chip shows it, linking to its page at that version. */
function WorkflowChip({ workflow }: { workflow: string }) {
  const parts = refParts(workflow);
  if (parts === null) return <Chip>{workflow}</Chip>;
  return (
    <PageLink
      to={workflowPath(parts.owner, parts.name, parts.version)}
      label={`Open ${workflow}`}
    >
      <Chip>{workflow}</Chip>
    </PageLink>
  );
}

/**
 * Choosing the workflow and its version from those the organiser may read,
 * in place of typing its name. One the task names that is not in the list,
 * one they may not read, stays chosen and listed.
 */
function Picker({
  value,
  items,
  onChange,
  disabled,
}: {
  value: string;
  items: WorkflowItem[];
  onChange: (ref: string) => void;
  disabled: boolean;
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

/** The steps of the chosen version, drawn read-only, as its own page draws them. */
function Steps({ workflow }: { workflow: string }) {
  const version = queryView(useWorkflowVersion(workflow));
  const primitives = queryView(usePrimitives());
  if (version.state === 'error') {
    return (
      <BodyText tone="secondary">
        Its steps cannot be shown: {version.error.detail ?? version.error.title}
      </BodyText>
    );
  }
  return (
    <Loaded view={version} rows={4}>
      {(read) => (
        <Loaded view={primitives} rows={4}>
          {(list) => <DrawnGraph text={read.content} primitives={list} />}
        </Loaded>
      )}
    </Loaded>
  );
}

/**
 * The Workflow card: which workflow grades the task, as a chip that opens its
 * page; a newer version when there is one, to take with one click; the
 * picker of workflows and versions; and the chosen version's steps, drawn.
 * Choosing here changes the task's other cards to the chosen workflow's
 * inputs and tests at once, and is saved with them, by the one save bar.
 */
export function WorkflowCard({
  saved,
  newer,
  problem,
  value,
  onChange,
  disabled,
}: {
  /** The workflow the task's last save names, or null when none. */
  saved: string | null;
  /** The workflow's newest version, when it comes after the one saved. */
  newer: string | null;
  /** Why the saved workflow cannot be read, when it cannot. */
  problem: string | null;
  value: string;
  onChange: (ref: string) => void;
  disabled: boolean;
}) {
  const list = queryView(useWorkflowList());
  const parts = refParts(saved ?? '');
  const newerRef =
    parts === null || newer === null ? null : `${parts.owner}/${parts.name}@${newer}`;
  const chosen = value.trim();
  return (
    <BuildCard
      id="workflow"
      title="Workflow"
      line="What grades the task: the steps every submission goes through."
      aside={saved !== null ? <WorkflowChip workflow={saved} /> : undefined}
    >
      {saved === null && chosen === '' && (
        <BodyText>
          No workflow is chosen yet. Choose one to say how the task grades.
        </BodyText>
      )}
      {problem !== null && <BodyText>{problem}</BodyText>}
      {newerRef !== null && (
        <div className={shared.actions} role="status" aria-label="A newer version">
          <Chip tone="warn">{newer} available</Chip>
          <BodyText tone="secondary">
            The task grades with {saved} until {newerRef} is chosen and saved.
          </BodyText>
          {chosen !== newerRef && !disabled && (
            <Button size="xs" variant="secondary" onClick={() => onChange(newerRef)}>
              Use {newer}
            </Button>
          )}
        </div>
      )}
      <FieldBox name="workflow">
        <Loaded view={list} rows={1}>
          {(items) => (
            <Picker
              value={chosen}
              items={items}
              onChange={onChange}
              disabled={disabled}
            />
          )}
        </Loaded>
      </FieldBox>
      {saved !== null && chosen !== saved && chosen !== '' && (
        <BodyText tone="secondary">
          Saving changes the task from {saved} to {chosen}. The other cards show what{' '}
          {chosen} asks for.
        </BodyText>
      )}
      {refParts(chosen) !== null && <Steps workflow={chosen} />}
    </BuildCard>
  );
}
