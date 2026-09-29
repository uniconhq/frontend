import { $api, widenQuery } from '@/api/query';
import type { Provisioning } from '@/api/types';
import { contestPath, orgPath, taskPath } from '@/lib/organiser-paths';

/**
 * The thing being made. A contest's and a task's progress is followed at the
 * scope above it, since the thing itself holds no roles until it is there.
 */
export type Target =
  | { kind: 'org'; org: string }
  | { kind: 'contest'; org: string; contest: string }
  | { kind: 'task'; org: string; contest: string; task: string };

/** Something just asked for, with the record the create answered with. */
export type Following = { target: Target; initial: Provisioning };

export function provisioningQuery(target: Target) {
  switch (target.kind) {
    case 'org':
      return widenQuery(
        $api.queryOptions('get', '/api/v1/orgs/{org}/provisioning', {
          params: { path: { org: target.org } },
        }),
      );
    case 'contest':
      return widenQuery(
        $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/provisioning', {
          params: { path: { org: target.org, contest: target.contest } },
        }),
      );
    case 'task':
      return widenQuery(
        $api.queryOptions(
          'get',
          '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/provisioning',
          {
            params: {
              path: { org: target.org, contest: target.contest, task: target.task },
            },
          },
        ),
      );
  }
}

/**
 * What a new thing makes stale once it is ready: an org's first admin is the
 * person who asked, so their roles, and the org list is read from them; a
 * contest or a task joins the list above it.
 */
export function staleOnceReady(target: Target): readonly unknown[] {
  switch (target.kind) {
    case 'org':
      return $api.queryOptions('get', '/api/v1/me').queryKey;
    case 'contest':
      return $api.queryOptions('get', '/api/v1/orgs/{org}/contests', {
        params: { path: { org: target.org } },
      }).queryKey;
    case 'task':
      return $api.queryOptions('get', '/api/v1/orgs/{org}/contests/{contest}/tasks', {
        params: { path: { org: target.org, contest: target.contest } },
      }).queryKey;
  }
}

export function nameOf(target: Target): string {
  switch (target.kind) {
    case 'org':
      return target.org;
    case 'contest':
      return target.contest;
    case 'task':
      return target.task;
  }
}

/** The new thing's own page, which is also what tells one target from another. */
export function pageOf(target: Target): string {
  switch (target.kind) {
    case 'org':
      return orgPath(target.org);
    case 'contest':
      return contestPath(target.org, target.contest);
    case 'task':
      return taskPath(target.org, target.contest, target.task);
  }
}
