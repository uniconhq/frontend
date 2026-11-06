/** The path params of each kind of place a route is under. */
type Params = {
  org: { org: string };
  contest: { org: string; contest: string };
  task: { org: string; contest: string; task: string };
  workflow: { owner: string; name: string };
  version: { owner: string; name: string; version: string };
};
type Kind = keyof Params;

/** A place of one of the kinds `K`. */
export type At<K extends Kind> = { [P in K]: { kind: P } & Params[P] }[K];

const PARAMS: { [P in Kind]: (place: At<P>) => Params[P] } = {
  org: ({ org }) => ({ org }),
  contest: ({ org, contest }) => ({ org, contest }),
  task: ({ org, contest, task }) => ({ org, contest, task }),
  workflow: ({ owner, name }) => ({ owner, name }),
  version: ({ owner, name, version }) => ({ owner, name, version }),
};

/**
 * Runs the route of the place's kind with the place's path params. Each
 * route names its own address, so openapi-fetch types it; the table must
 * have a route for every kind the place can be.
 */
export function byPlace<K extends Kind, R>(
  place: NoInfer<At<K>>,
  routes: { [P in K]: (path: Params[P]) => R },
): R {
  return run(place);
  function run<P extends K>(at: At<P>): R {
    const kind: P = at.kind;
    return routes[kind](PARAMS[kind](at));
  }
}
