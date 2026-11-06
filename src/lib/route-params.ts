import { useParams } from 'react-router';

/** A missing param is a wiring mistake in the route table, so it throws. */
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
