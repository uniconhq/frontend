import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { DefinitionProblem } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { nextVersion } from './versions';
import classes from './workflows.module.css';

/**
 * "Publish version" on the draft's bar (M32): the saved draft frozen as the
 * next version, `v` and the number after the highest, which tasks may then
 * choose. A dialog says what that means before it is done, and what the
 * forge refused, with every problem, when it does not make one. Unsaved
 * changes are not in a version, so it asks for a save first.
 */
export function PublishVersion({
  owner,
  name,
  versions,
  token,
  revision,
  dirty,
  problems,
  checking = false,
  onPublished,
}: {
  owner: string;
  name: string;
  versions: string[];
  /** The token the draft was last saved with. */
  token: string | null;
  revision?: string | null;
  dirty: boolean;
  /** How many problems the check found, which a version would be refused for. */
  problems: number;
  /** The draft's check has not answered yet for the text as it is. */
  checking?: boolean;
  onPublished: (version: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState<{
    error: ApiError;
    problems: DefinitionProblem[];
    /** The version asked for, when someone else made it first. */
    taken: string | null;
  } | null>(null);
  const make = $api.useMutation('post', '/api/v1/workflows/{owner}/{name}/versions');
  const next = nextVersion(versions);

  const page = $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}', {
    params: { path: { owner, name } },
  }).queryKey;

  const publish = async () => {
    setRefused(null);
    const asked = next;
    try {
      const made = await make.mutateAsync({
        params: { path: { owner, name } },
        body: { version: asked, token, ...(revision == null ? {} : { revision }) },
      });
      await queryClient.invalidateQueries({ queryKey: page });
      setOpen(false);
      onPublished(made.version);
    } catch (caught) {
      const error = toApiError(caught);
      // What was refused may be out of date (a version made, the draft saved
      // by someone else): read the workflow again, so the dialog offers what
      // holds now.
      await queryClient.invalidateQueries({ queryKey: page });
      setRefused({
        error,
        problems: Array.isArray(error.extensions.errors)
          ? (error.extensions.errors as DefinitionProblem[])
          : [],
        taken: error.code === 'conflict' ? asked : null,
      });
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setRefused(null);
          setOpen(true);
        }}
      >
        Publish version
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title={`Publish ${next}`}>
        <div className={classes.stack}>
          <BodyText size="md">
            {next} will hold the draft as it was last saved, and never change. Tasks
            choose a version to grade with, so it grades nothing until a task chooses
            it.
          </BodyText>
          {dirty && (
            <BodyText size="md">
              You have changes that are not saved. Save them first to put them in {next}
              .
            </BodyText>
          )}
          {!dirty && checking && (
            <BodyText size="md">
              The draft is still being checked. Wait a moment for its answer.
            </BodyText>
          )}
          {!dirty && !checking && problems > 0 && (
            <BodyText size="md">
              {problems === 1
                ? 'One problem stops'
                : `${String(problems)} problems stop`}{' '}
              it: fix {problems === 1 ? 'it' : 'them'} first, from the list above the
              graph.
            </BodyText>
          )}
          {refused !== null && (
            <div role="alert" className={classes.stack}>
              <BodyText size="md">
                {refused.taken !== null && versions.includes(refused.taken)
                  ? `Someone else published ${refused.taken} meanwhile, so this will be ${next}.`
                  : `No version was made: ${refused.error.detail ?? refused.error.message}`}
              </BodyText>
              {refused.problems.length > 0 && (
                <ul className={classes.problems}>
                  {refused.problems.map((problem) => (
                    <li key={`${problem.path} ${problem.message}`}>
                      {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className={classes.actions}>
            <Button
              loading={make.isPending}
              disabled={dirty || checking || problems > 0}
              onClick={() => void publish()}
            >
              Publish {next}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
