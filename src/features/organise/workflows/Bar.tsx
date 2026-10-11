import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { WorkflowPage } from '@/api/types';
import { Select } from '@/ui/Select';
import { workflowPath } from '@/lib/organiser-paths';
import { latestVersion, versionNumber } from './versions';
import classes from './workflows.module.css';

const DRAFT = '';

/** The versions newest first: by number, any other name after them as listed. */
function newestFirst(versions: readonly string[]): string[] {
  const numbered = versions
    .filter((version) => versionNumber(version) !== null)
    .sort((a, b) => (versionNumber(b) ?? 0) - (versionNumber(a) ?? 0));
  return [
    ...numbered,
    ...versions.filter((version) => versionNumber(version) === null),
  ];
}

/**
 * The bar over a workflow (M32): which one is shown, the draft or a version,
 * as a switcher, a sentence saying what that means, and the actions for it,
 * such as Save and "Publish version" on the draft. It stays in view as the
 * page scrolls down a tall graph.
 */
export function WorkflowBar({
  page,
  version,
  status,
  children,
}: {
  page: WorkflowPage;
  /** The version shown, or null for the draft. */
  version: string | null;
  /** A short line after the switcher, such as whether the draft is saved. */
  status?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const latest = latestVersion(page.versions);
  const options = [
    ...(page.editable && page.draft !== null
      ? [{ value: DRAFT, label: 'The draft' }]
      : []),
    ...newestFirst(page.versions).map((each) => ({
      value: each,
      label: each === latest ? `${each}, the latest version` : `Version ${each}`,
    })),
  ];
  return (
    <div className={classes.barFrame} data-workflow-bar>
      <div className={classes.bar} role="toolbar" aria-label="The workflow">
        {options.length > 0 && (
          <div className={classes.switch}>
            <Select
              label="Showing"
              value={version ?? DRAFT}
              options={options}
              onChange={(chosen) =>
                void navigate(
                  workflowPath(
                    page.owner,
                    page.name,
                    chosen === DRAFT ? undefined : chosen,
                  ),
                )
              }
            />
          </div>
        )}
        {status !== undefined && <div className={classes.status}>{status}</div>}
        <div className={classes.barActions}>{children}</div>
      </div>
      <p className={classes.where}>
        {version === null
          ? 'You are editing the draft. Saving keeps your changes; publishing a version freezes the draft as it was saved, for tasks to choose.'
          : `You are looking at ${version}, a version: it never changes, and every task that chose it grades with it.`}
      </p>
    </div>
  );
}
