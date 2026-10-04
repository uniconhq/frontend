import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { Submission, TaskPage } from '@/api/types';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/SectionTitle';
import { t } from '@/lib/t';
import { emptyDraft, isPanelInput, type Draft } from './draft';
import { newestFirst } from './grading';
import { SubmissionDetail } from './SubmissionDetail';
import { SubmissionList } from './SubmissionList';
import { openSubmission } from './submission-param';
import { SubmitPanel, type Notice } from './SubmitPanel';
import { useSubmit } from './use-submit';
import shared from '../contest.module.css';

/**
 * The contestant's half of a task page below its statement: the panel they
 * submit from while the task is open, the submission the address opens, and
 * the list of their own submissions. The panel's contents live here, so
 * restoring an earlier submission can fill it; a submission that goes
 * through empties it and joins the top of the list at once.
 */
export function TaskSubmissions({
  org,
  contest,
  task,
  page,
}: {
  org: string;
  contest: string;
  task: string;
  page: TaskPage;
}) {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const [search] = useSearchParams();
  const opened = openSubmission(search);

  const inputs = page.inputs.filter(isPanelInput);
  const notebook = page.inputs.some((input) => input.type === 'jupyter');
  const open = page.release.open;

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(inputs));
  const [notice, setNotice] = useState<Notice | null>(null);
  const submitter = useSubmit({
    org,
    contest,
    task,
    inputs,
    maxSize: page.limits.max_size,
  });

  const listKey = $api.queryOptions(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions',
    { params: { path: { org, contest, task } } },
  ).queryKey;

  const change = (next: Draft) => {
    setDraft(next);
    setNotice(null);
  };

  const submit = async () => {
    setNotice(null);
    const made = await submitter.submit(draft);
    if (made === null) return;
    queryClient.setQueryData<Submission[]>(listKey, (current) =>
      newestFirst([
        made,
        ...(current ?? []).filter((found) => found.number !== made.number),
      ]),
    );
    void queryClient.invalidateQueries({ queryKey: listKey });
    setDraft(emptyDraft(inputs));
    setNotice({ kind: 'submitted', number: made.number });
  };

  return (
    <>
      {open && (
        <Card>
          <div className={shared.stack}>
            <SectionTitle>{t('Submit')}</SectionTitle>
            <SubmitPanel
              inputs={inputs}
              notebook={notebook}
              taskMaxSize={page.limits.max_size}
              draft={draft}
              onDraftChange={change}
              onSubmit={() => void submit()}
              phase={submitter.phase}
              sentOf={submitter.sentOf}
              refusal={submitter.refusal}
              notice={notice}
            />
          </div>
        </Card>
      )}
      {opened !== null && (
        <Card>
          <SubmissionDetail
            org={org}
            contest={contest}
            task={task}
            number={opened}
            closeTo={pathname}
          />
        </Card>
      )}
      <Card>
        <div className={shared.stack}>
          <SectionTitle>{t('Your submissions')}</SectionTitle>
          <SubmissionList org={org} contest={contest} task={task} />
        </div>
      </Card>
    </>
  );
}
