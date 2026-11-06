import type { ApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { DefinitionErrors } from '../DefinitionErrors';
import { definitionErrorsOf } from '../files/refusals';
import classes from './workflows.module.css';

/** Why a save of the draft was refused; one over someone else's save offers a reload. */
export function SaveRefusal({
  error,
  onReload,
}: {
  error: ApiError;
  onReload: () => void;
}) {
  if (error.code === 'conflict')
    return (
      <div role="alert" className={classes.stack}>
        <BodyText>{error.detail ?? error.message}</BodyText>
        <BodyText tone="secondary">
          Nothing was saved. Reloading shows the draft as it was saved and replaces your
          changes.
        </BodyText>
        <div>
          <Button variant="secondary" onClick={onReload}>
            Reload the draft
          </Button>
        </div>
      </div>
    );
  return (
    <div role="alert">
      <ErrorBlock error={error} compact heading="Couldn’t save" />
      <DefinitionErrors errors={definitionErrorsOf(error)} />
    </div>
  );
}
