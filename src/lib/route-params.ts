import { useParams } from 'react-router';

/**
 * The scope a page is about, from its route. The route table guarantees each
 * one is there, so a missing one is a wiring mistake and throws rather than
 * rendering a page about nothing.
 */
function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new Error(`the route has no :${name} parameter`);
  }
  return value;
}

export function useOrgParam(): string {
  return required(useParams().org, 'org');
}

export function useContestParams(): { org: string; contest: string } {
  const params = useParams();
  return {
    org: required(params.org, 'org'),
    contest: required(params.contest, 'contest'),
  };
}

export function useTaskParams(): { org: string; contest: string; task: string } {
  const params = useParams();
  return {
    org: required(params.org, 'org'),
    contest: required(params.contest, 'contest'),
    task: required(params.task, 'task'),
  };
}

export function useWorkflowParams(): { owner: string; name: string } {
  const params = useParams();
  return {
    owner: required(params.owner, 'owner'),
    name: required(params.name, 'name'),
  };
}
