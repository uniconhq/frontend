import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import type { OrganisedBoard } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { BoardTable } from '@/ui/boards/BoardTable';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { CONTEST_SECTIONS, sectionOf } from '@/lib/sections';
import { useContestParams } from '@/lib/route-params';
import { ContestFile } from '../contest/ContestFile';
import { useOpenedField } from '../contest/opened';
import { viewFilePath } from '../contest/places';
import { useHeldGroups, useReportedValues } from '../contest/published';
import { boardProblems } from '../forms/board-values';
import { BoardFields } from '../forms/BoardFields';
import { readContest, writeContest, type ContestValues } from '../forms/contest-values';
import type { FormProps } from '../forms/DefinitionFile';
import { holdsAtContest } from '../roles';
import { SectionPage } from '../SectionPage';
import classes from '../organise.module.css';

/** Read again now and then, since a board is computed from what is graded and shown. */
const MEANWHILE_MS = 30_000;

/** The entrant previewed, kept in the page's address as `entrant`, its id. */
const ROW_PARAM = 'entrant';

function pickedOf(search: URLSearchParams): { entrant: string } | null {
  const value = search.get(ROW_PARAM)?.trim() ?? '';
  return value === '' ? null : { entrant: value };
}

/** Every entrant any board lists once every result is shown, once each, by name. */
function rowChoices(boards: OrganisedBoard[]): { value: string; label: string }[] {
  const named = new Map<string, string>();
  for (const board of boards) {
    for (const row of board.final.rows) {
      named.set(row.row.entrant, row.row.name === '' ? 'An entrant' : row.row.name);
    }
  }
  return [...named]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The boards' settings as a form, each board in plain words with the
 * sentence that says what it ranks; a manager adds, changes and removes
 * boards, and everyone else reads them.
 */
function BoardsForm({
  org,
  contest,
  doc,
  busy,
  onSave,
  refused,
  admin,
  manages,
}: FormProps & { org: string; contest: string; admin: boolean; manages: boolean }) {
  const [read] = useState(() => readContest(doc));
  const [values, setValues] = useState<ContestValues>(read.values);
  const held = useHeldGroups(org, contest, values);
  const reported = useReportedValues(org, contest);
  useOpenedField(true);
  const changed = JSON.stringify(values) !== JSON.stringify(read.values);
  const problems = values.boards.flatMap(boardProblems);

  if (read.unreadable.includes('leaderboards')) {
    return <BodyText>The leaderboards’ settings cannot be read here.</BodyText>;
  }
  return (
    <form
      className={classes.stack}
      aria-label="Leaderboards"
      onSubmit={(event) => {
        event.preventDefault();
        onSave((fresh) => writeContest(fresh, read.values, values, { admin }));
      }}
    >
      <BoardFields
        boards={values.boards}
        taskIds={values.tasks.map((entry) => entry.id)}
        held={held}
        reported={reported}
        refused={refused}
        disabled={!manages}
        onChange={(boards) => setValues((before) => ({ ...before, boards }))}
      />
      {manages && (
        <div className={classes.actions}>
          <Button
            type="submit"
            loading={busy}
            disabled={!changed || problems.length > 0}
          >
            Save leaderboards
          </Button>
          {changed && <UnsavedNote />}
        </div>
      )}
    </form>
  );
}

/**
 * One board as organisers read it: now, exactly what its audience is given,
 * every row unless an entrant is previewed, then as that entrant sees it;
 * and as it will read once every result is shown. What it does not count
 * yet is listed with when entrants get it. What the board asks of its tasks
 * that does not hold is said above both.
 */
function Previewed({ board, picked }: { board: OrganisedBoard; picked: boolean }) {
  const name = board.final.board;
  return (
    <Card>
      <div className={classes.stack}>
        {board.notes.length > 0 && (
          <div className={classes.panel} role="note" aria-label={`Notes on ${name}`}>
            <ul className={classes.named}>
              {board.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        <BoardTable
          board={board.now}
          title={`${name}, now`}
          everyRow={!picked}
          ownLabel="The entrant previewed"
        />
        <BoardTable
          board={board.final}
          title={`${name}, once every result is shown`}
          everyRow
        />
      </div>
    </Card>
  );
}

/**
 * A contest's boards: their settings as a form, then each board as it reads
 * now and as it will once every result is shown, for anyone with the
 * observer role at the contest, whatever each board shows to whom. An
 * entrant can be previewed, kept in the address: each board now as that
 * entrant is given it, computed exactly as theirs is.
 */
export function OrganisedBoardsPage() {
  const { org, contest } = useContestParams();
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const [search, setSearch] = useSearchParams();
  const picked = pickedOf(search);
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/organise/boards',
      { params: { path: { org, contest }, query: picked ?? {} } },
      { refetchInterval: MEANWHILE_MS },
    ),
  );

  const pick = (value: string) => {
    const next = new URLSearchParams(search);
    if (value === '') next.delete(ROW_PARAM);
    else next.set(ROW_PARAM, value);
    setSearch(next);
  };

  return (
    <SectionPage
      section={sectionOf(CONTEST_SECTIONS, 'boards')}
      links={<PageLink to={viewFilePath(org, contest)}>View file</PageLink>}
    >
      <Card>
        <ContestFile org={org} contest={contest}>
          {(props) => (
            <BoardsForm {...props} org={org} contest={contest} manages={manages} />
          )}
        </ContestFile>
      </Card>
      {view.state === 'loading' && <PageSkeleton rows={4} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && view.data.length > 0 && (
        <>
          <SectionTitle>How they look</SectionTitle>
          <div className={classes.form}>
            <Select
              label="Preview as an entrant"
              value={search.get(ROW_PARAM) ?? ''}
              options={rowChoices(view.data)}
              placeholder="Every row, as organisers see it"
              description="Shows each leaderboard as this entrant sees it now."
              onChange={pick}
            />
          </div>
          {view.data.map((board) => (
            <Previewed key={board.final.board} board={board} picked={picked !== null} />
          ))}
        </>
      )}
    </SectionPage>
  );
}
