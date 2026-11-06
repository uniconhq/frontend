import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { $api, queryView } from '@/api/query';
import type {
  FeedEntry,
  ShowPreview as Preview,
  ShowPreviewRequest,
} from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Chip } from '@/ui/Chip';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { Grading } from '@/ui/scored/Grading';
import { ShownTask } from '@/ui/scored/ShownInputs';
import { Group } from '@/ui/layout';
import { useSettled } from '@/lib/use-settled';
import { definitionErrorsOf } from '../files/refusals';
import { taskPath, type TaskPlace } from './build-data';
import { MOMENTS, showLists, type Moment, type Show } from './scoring-model';
import classes from './task.module.css';

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** How long the grid stays still before the preview is asked for again. */
const SETTLE_MS = 400;

/** The preview's out-of-date line: it shows the publication, with the grid's show. */
const OUT_OF_DATE = 'Publish to preview these changes';

const NEVER_PUBLISHED = 'Publish the task to preview it.';

/** A submission to preview with: its entrant, by id, and its number. */
type Picked = { entrant: string; number: number };

/** Each graded submission once, by its entrant's name and its number, newest first. */
function gradedOf(entries: FeedEntry[]): (Picked & { label: string })[] {
  const seen = new Set<string>();
  const picks: (Picked & { label: string })[] = [];
  for (const { by, grading } of entries) {
    if (grading.status !== 'done') continue;
    const key = `${by.entrant}:${String(grading.submission_number)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const who = by.entrant_name ?? by.username ?? 'An entrant';
    picks.push({
      entrant: by.entrant,
      number: grading.submission_number,
      label: `${who}, #${String(grading.submission_number)}`,
    });
  }
  return picks;
}

function hiddenWords(count: number): string {
  return `${String(count)} ${count === 1 ? 'run' : 'runs'} hidden`;
}

/**
 * What an entrant would see at a moment, under the grid's show: their
 * submission's page, or with none picked, the task's page with where each
 * value and output will appear. It is the latest publication with the
 * grid's show in its place, asked for again once the grid stays still, so
 * other changes not yet published do not reach it; it says so then.
 */
export function ShowPreview({
  place,
  show,
  elsewhere,
}: {
  place: TaskPlace;
  show: Show;
  /** The draft changes more than show, which the preview cannot show until published. */
  elsewhere: boolean;
}) {
  const path = taskPath(place);
  const [moment, setMoment] = useState<Moment>('always');
  const [picked, setPicked] = useState('');
  const state = $api.useQuery('get', TASK, { params: { path } });
  const gradings = $api.useQuery('get', `${TASK}/gradings`, { params: { path } });
  const picks = gradedOf(gradings.data ?? []);
  const pick = picks.find(
    (each) => `${each.entrant}:${String(each.number)}` === picked,
  );
  const published = state.data?.latest ?? null;
  // Settled as text, which stays the same from render to render while the
  // grid does, where an object made afresh each render would not.
  const asked = useSettled(
    JSON.stringify({
      show: showLists(show) ?? {},
      moment,
      ...(pick === undefined ? {} : { entrant: pick.entrant, number: pick.number }),
    }),
    SETTLE_MS,
  );
  const body = useMemo(() => JSON.parse(asked) as ShowPreviewRequest, [asked]);
  const preview = queryView(
    useQuery({
      // A new publication answers the same body afresh.
      queryKey: ['show-preview', path, published?.version ?? null, body],
      queryFn: async (): Promise<Preview> => {
        const { data } = await apiClient.POST(`${TASK}/show-preview`, {
          params: { path },
          body,
        });
        if (data === undefined) throw new Error('The preview could not be read.');
        return data;
      },
      enabled: published !== null,
      placeholderData: keepPreviousData,
      retry: false,
    }),
  );
  const outdated =
    elsewhere || (published !== null && state.data?.head !== published.version);

  return (
    <div className={classes.preview}>
      <Group gap="10px 24px" align="flex-start">
        <RadioGroup
          label="Moment"
          value={moment}
          options={MOMENTS.map(({ value, label }) => ({ value, label }))}
          onChange={(next) => {
            const found = MOMENTS.find((each) => each.value === next);
            if (found !== undefined) setMoment(found.value);
          }}
        />
        <Select
          label="Preview with"
          value={pick === undefined ? '' : picked}
          width="md"
          options={[
            { value: '', label: 'No submission' },
            ...picks.map((each) => ({
              value: `${each.entrant}:${String(each.number)}`,
              label: each.label,
            })),
          ]}
          onChange={setPicked}
        />
      </Group>
      {state.isError ? (
        <ErrorBlock error={state.error} onRetry={() => void state.refetch()} />
      ) : state.data !== undefined && published === null ? (
        <BodyText tone="secondary">{NEVER_PUBLISHED}</BodyText>
      ) : (
        <>
          {outdated && (
            <>
              <div className={classes.ownWidth}>
                <Chip tone="warn">{OUT_OF_DATE}</Chip>
              </div>
              <BodyText size="sm" tone="secondary">
                Until then this is the latest publication, with what the grid shows.
              </BodyText>
            </>
          )}
          <div
            className={classes.previewPage}
            aria-label="An entrant's page"
            role="region"
          >
            <Answer view={preview} />
          </div>
        </>
      )}
    </div>
  );
}

function Answer({ view }: { view: ReturnType<typeof queryView<Preview>> }) {
  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error') {
    const problems = definitionErrorsOf(view.error);
    if (problems.length > 0) {
      return (
        <ul className={classes.previewProblems} aria-label="Why it cannot be previewed">
          {problems.map((problem) => (
            <li key={`${problem.path.join('.')}:${problem.message}`}>
              {problem.message}
            </li>
          ))}
        </ul>
      );
    }
    if (view.error.code === 'not_found')
      return <BodyText tone="secondary">{view.error.detail}</BodyText>;
    return (
      <ErrorBlock
        error={view.error}
        compact
        onRetry={view.retry}
        heading="Couldn’t preview"
      />
    );
  }
  const { result, placeholders, hidden } = view.data;
  const empty =
    result === null &&
    (placeholders === null ||
      (placeholders.values.length === 0 &&
        placeholders.outputs.length === 0 &&
        placeholders.runs.length === 0 &&
        Object.keys(placeholders.inputs).length === 0));
  return (
    <>
      {empty && (
        <BodyText tone="secondary">Entrants see nothing at this moment.</BodyText>
      )}
      {result !== null && <Grading grading={result} />}
      {placeholders !== null && (
        <>
          {placeholders.values.length + placeholders.outputs.length > 0 && (
            <ul className={classes.previewSlots} aria-label="Where results appear">
              {[
                ...placeholders.values.map((name) => ({ key: `value:${name}`, name })),
                ...placeholders.outputs.map((name) => ({
                  key: `output:${name}`,
                  name,
                })),
              ].map(({ key, name }) => (
                <li key={key}>{`${name} appears here`}</li>
              ))}
            </ul>
          )}
          <ShownTask runs={placeholders.runs} inputs={placeholders.inputs} />
        </>
      )}
      {hidden > 0 && <BodyText tone="secondary">{hiddenWords(hidden)}</BodyText>}
    </>
  );
}
