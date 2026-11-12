import type { QueryView } from '@/api/query';
import type { ShowPreview as Preview } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { RadioGroup } from '@/ui/RadioGroup';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { Grading } from '@/ui/scored/Grading';
import { definitionErrorsOf } from '../files/refusals';
import { MOMENTS, type Moment } from './scoring-model';
import classes from './task.module.css';

function hiddenWords(count: number): string {
  return `${String(count)} ${count === 1 ? 'run' : 'runs'} hidden`;
}

/** The preview's moment, and the entrant's page at it. */
export function ShowPreview({
  moment,
  onMoment,
  preview,
}: {
  moment: Moment;
  onMoment: (moment: Moment) => void;
  preview: QueryView<Preview>;
}) {
  return (
    <div className={classes.preview}>
      <RadioGroup
        label="Moment"
        value={moment}
        options={MOMENTS.map(({ value, label }) => ({ value, label }))}
        onChange={(next) => {
          const found = MOMENTS.find((each) => each.value === next);
          if (found !== undefined) onMoment(found.value);
        }}
      />
      <div className={classes.previewPage} aria-label="An entrant's page" role="region">
        <Answer view={preview} />
      </div>
    </div>
  );
}

function Answer({ view }: { view: QueryView<Preview> }) {
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
    return (
      <ErrorBlock error={view.error} onRetry={view.retry} heading="Couldn’t preview" />
    );
  }
  const { result, hidden } = view.data;
  return (
    <>
      <Grading grading={result} />
      {hidden > 0 && <BodyText tone="secondary">{hiddenWords(hidden)}</BodyText>}
    </>
  );
}
