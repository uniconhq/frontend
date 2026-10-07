import type { Publication, TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { formatDateTime } from '@/lib/time';
import { taskPath } from '@/lib/organiser-paths';
import { DefinitionErrors } from '../DefinitionErrors';
import classes from './standings.module.css';

function when(at: string): string {
  return formatDateTime(new Date(at));
}

/** A fraction as a percentage, to a tenth at most: 0.1 is `10%`. */
function percent(fraction: number): string {
  return `${String(Math.round(fraction * 1000) / 10)}%`;
}

function LatestPublication({ latest }: { latest: Publication | null }) {
  if (latest === null) return <BodyText>Never published</BodyText>;
  return (
    <BodyText>
      Publication {latest.number}, {when(latest.at)},{' '}
      {latest.grading_changed ? 'changed how it grades' : 'grading unchanged'}
    </BodyText>
  );
}

/**
 * The draft a save left on top of the latest publication: one whose save
 * failed validation, with each error at its YAML path, or one kept back on
 * purpose.
 */
function Draft({ standing }: { standing: TaskStanding }) {
  const { state } = standing;
  if (!state.draft) return null;
  if (state.errors.length === 0) {
    return (
      <BodyText tone="secondary">
        A draft sits on top of it, kept back from contestants.
      </BodyText>
    );
  }
  return (
    <div className={classes.draft}>
      <BodyText>
        {state.latest === null
          ? 'Its last save did not pass validation:'
          : 'A draft sits on top of it, since its last save did not pass validation:'}
      </BodyText>
      <DefinitionErrors errors={state.errors} />
    </div>
  );
}

/** When it opens, falls due and closes, and what it is worth, defaults resolved. */
function Timeline({ standing }: { standing: TaskStanding }) {
  const { timeline, state } = standing;
  const due =
    timeline.due === null
      ? 'No due time'
      : `${when(timeline.due)}${
          timeline.late_per_day === null
            ? ''
            : `, then ${percent(timeline.late_per_day)} off per late day started`
        }`;
  const worth =
    timeline.worth !== null
      ? `${String(timeline.worth)} ${timeline.worth === 1 ? 'point' : 'points'}`
      : state.latest === null
        ? 'Not known until published'
        : 'No points';
  const rows: [string, string][] = [
    ['Released', when(timeline.release_at)],
    ['Due', due],
    ['Closes', when(timeline.closes)],
    ['Worth', worth],
  ];
  return (
    <dl className={classes.timeline}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Where each of the contest's tasks stands, in the contest's order: its
 * letter and name, linking to its page, its latest publication or that it
 * has none, a draft on top of it with that draft's errors, and its timeline
 * from its entry in `contest.yaml`, each time at its default where the entry
 * gives none.
 */
export function TaskStandings({
  org,
  contest,
  standings,
}: {
  org: string;
  contest: string;
  standings: TaskStanding[];
}) {
  return (
    <ul className={classes.list} aria-label="Tasks">
      {standings.map((standing) => (
        <li
          key={standing.task.name}
          className={classes.task}
          aria-label={`${standing.label} · ${standing.task.name}`}
        >
          <div className={classes.name}>
            <span className={classes.letter}>{standing.label}</span>
            <PageLink to={taskPath(org, contest, standing.task.name)} mono>
              {standing.task.name}
            </PageLink>
          </div>
          <LatestPublication latest={standing.state.latest} />
          <Draft standing={standing} />
          <Timeline standing={standing} />
        </li>
      ))}
    </ul>
  );
}
