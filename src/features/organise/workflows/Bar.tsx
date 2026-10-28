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
 * as a switcher, the graph's tools, such as Undo and Show inputs and files,
 * and the actions for it, such as Save and "Publish version" on the draft. It
 * stays in view as the page scrolls down a tall graph, on one line where the
 * page is wide enough; the switcher's name is for a screen reader, its value
 * saying what is shown. Under it, once, a sentence says what that means; it
 * scrolls away with the page.
 */
export function WorkflowBar({
  page,
  version,
  status,
  tools,
  children,
}: {
  page: WorkflowPage;
  /** The version shown, or null for the draft. */
  version: string | null;
  /** A short line after the switcher, such as whether the draft is saved. */
  status?: ReactNode;
  /** The graph's tools, such as Undo, Redo and Show inputs and files. */
  tools?: ReactNode;
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
    <>
      <div className={classes.barFrame} data-workflow-bar>
        <div className={classes.bar} role="toolbar" aria-label="The workflow">
          {options.length > 0 && (
            <div className={classes.switch}>
              <Select
                label="Showing"
                labelHidden
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
          {status !== undefined && <div>{status}</div>}
          {tools !== undefined && (
            <div className={classes.tools} role="group" aria-label="Editing">
              {tools}
            </div>
          )}
          <div className={classes.barActions}>{children}</div>
        </div>
      </div>
      <p className={classes.where}>
        {version === null
          ? 'You are editing the draft. Publishing freezes it as saved, as a version tasks can choose.'
          : `You are looking at ${version}, a version. It never changes; tasks that chose it grade with it.`}
      </p>
    </>
  );
}
