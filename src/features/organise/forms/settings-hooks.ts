import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toApiError } from '@/api/problem';
import { EDITED } from '@/live';
import type { Outcome } from '../files/SaveOutcome';
import { settingsQuery, staleAfterWrite, type Place } from '../files/place';
import type { Values } from './values';

/** A save of a form's values: every value, with the token they were read at. */
export type SettingsBody = {
  values: Values;
  token: string | null;
  confirm: boolean;
  asked?: string | null;
  keep_as_draft: boolean;
};

/**
 * The settings read for a form, under a key of their own, read once and
 * afresh each time the form opens and after each save, never behind the
 * organiser's back.
 */
export function useOwnSettings(place: Place) {
  const { queryKey, queryFn } = settingsQuery(place);
  return useQuery({
    queryKey: [...queryKey, 'own'],
    queryFn,
    meta: EDITED,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Saving a form's values: at a contest the settings' own write, at a task the
 * task's save with `task.yaml` given as values. What a save moves is read
 * again after one that went through.
 */
export function useSettingsWrite(place: Place) {
  const queryClient = useQueryClient();

  const write = async (body: SettingsBody): Promise<Outcome<SettingsBody>> => {
    let outcome: Outcome<SettingsBody>;
    try {
      outcome = await send(place, body);
    } catch (caught) {
      return { kind: 'refused', error: toApiError(caught), body };
    }
    await Promise.all(
      staleAfterWrite(place).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
    return outcome;
  };

  return { write };
}

async function send(place: Place, body: SettingsBody): Promise<Outcome<SettingsBody>> {
  if (place.kind === 'task') {
    const { data } = await apiClient.POST(
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/save',
      {
        params: { path: { org: place.org, contest: place.contest, task: place.task } },
        body: {
          changes: [
            {
              path: 'task.yaml',
              token: body.token,
              values: body.values,
              encoding: 'utf-8',
              remove: false,
            },
          ],
          confirm: body.confirm,
          asked: body.asked ?? null,
          keep_as_draft: body.keep_as_draft,
        },
      },
    );
    if (data === undefined) throw new Error('The save got no answer. Try again.');
    return { kind: 'saved', result: data };
  }
  const { data } = await apiClient.PUT(
    '/api/v1/orgs/{org}/contests/{contest}/settings',
    {
      params: { path: { org: place.org, contest: place.contest } },
      body: {
        values: body.values,
        token: body.token,
        confirm: body.confirm,
        asked: body.asked ?? null,
      },
    },
  );
  if (data === undefined) throw new Error('The save got no answer. Try again.');
  return { kind: 'written', version: data.version, notes: data.notes };
}
