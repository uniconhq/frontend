import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { Submission, TaskPage, TaskRelease } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/SectionTitle';
import { notIn, SUBMIT_WORDS } from '../entry/not-in';
import { emptyDraft, type Draft } from './draft';
import { newestFirst } from './grading';
import { SubmissionDetail } from './SubmissionDetail';
import { SubmissionList } from './SubmissionList';
import { openSubmission } from './submission-param';
import { SubmitPanel, type Notice } from './SubmitPanel';
import { useSubmit } from './use-submit';
import shared from '../contest.module.css';

/**
 * Why a task takes no submission from this person now, said where the panel
 * would be: a task is open to a row only while it is released, its contest
 * is not archived, the row's close of it has not passed and the organisers
 * have not withdrawn it; and only an approved entrant holds a row to submit
 * from.
 */
const CLOSED: Record<
  Exclude<NonNullable<TaskRelease['closed']>, 'not_approved'>,
  string
> = {
  not_released: 'This task is not released yet.',
  archived: 'The contest is archived, so its tasks take no submissions.',
  closed: 'This task has closed for you, so it takes no more submissions from you.',
  withdrawn: 'This task was withdrawn from the contest, so it takes no submissions.',
};

/**
 * Why the task takes nothing from someone who is not an approved entrant,
 * as it stands for them (`SUBMIT_WORDS`), from the contest's home; while
 * that is read, or when it cannot be, what holds for everyone.
 */
function NotApproved({ org, contest }: { org: string; contest: string }) {
  const home = $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
    params: { path: { org, contest } },
  });
  return (
    <BodyText>
      {home.data === undefined
        ? 'Only the contest’s approved entrants can submit to this task.'
        : SUBMIT_WORDS[notIn(home.data)]}
    </BodyText>
  );
}

function ClosedReason({
  org,
  contest,
  closed,
}: {
  org: string;
  contest: string;
  closed: TaskRelease['closed'];
}) {
  if (closed === 'not_approved') return <NotApproved org={org} contest={contest} />;
  return (
    <BodyText>
      {closed === null ? 'This task takes no submissions right now.' : CLOSED[closed]}
    </BodyText>
  );
}

/**
 * The contestant's half of a task page below its statement: the panel they
 * submit from while the task is open or why it is not in its place, the
 * submission the address opens, and the list of their own submissions. The
 * panel's contents live here, so a submission that goes through empties it
 * and joins the top of the list at once.
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

  const inputs = page.inputs;
  const open = page.release.open;

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(inputs));
  const [notice, setNotice] = useState<Notice | null>(null);
  const submitter = useSubmit({
    org,
    contest,
    task,
    inputs,
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
      <Card>
        <div className={shared.stack}>
          <SectionTitle>Submit</SectionTitle>
          {open ? (
            <SubmitPanel
              inputs={inputs}
              draft={draft}
              onDraftChange={change}
              onSubmit={() => void submit()}
              phase={submitter.phase}
              sentOf={submitter.sentOf}
              refusal={submitter.refusal}
              notice={notice}
            />
          ) : (
            <div role="status" aria-label="Why you cannot submit">
              <ClosedReason org={org} contest={contest} closed={page.release.closed} />
            </div>
          )}
        </div>
      </Card>
      {opened !== null && (
        <Card>
          <SubmissionDetail
            org={org}
            contest={contest}
            task={task}
            number={opened}
            closeTo={pathname}
            inputs={inputs}
          />
        </Card>
      )}
      <Card>
        <div className={shared.stack}>
          <SectionTitle>Your submissions</SectionTitle>
          <SubmissionList
            org={org}
            contest={contest}
            task={task}
            marked={page.marks !== null}
          />
        </div>
      </Card>
    </>
  );
}
