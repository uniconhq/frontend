import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/problem';
import type { Outcome } from '../files/SaveOutcome';
import { settingsQuery } from '../files/place';
import { useSettingsWrite, type SettingsBody } from '../forms/settings-hooks';
import { copyOf, type Values } from '../forms/values';

/**
 * One change to the contest's settings made by a button, such as opening
 * the contest: the settings read afresh, the change applied to a copy of
 * them, and the values saved with the version just read. With `retry`, a
 * save someone else's beat in the meantime is made again once on the
 * settings as they are then, for a change that means the same on either,
 * such as setting the status. Without it the conflict is answered.
 */
export function useContestChange(org: string, contest: string) {
  const place = { kind: 'contest' as const, org, contest };
  const queryClient = useQueryClient();
  const settingsWrite = useSettingsWrite(place);
  const [pending, setPending] = useState(false);

  const write = async (body: SettingsBody): Promise<Outcome<SettingsBody>> => {
    setPending(true);
    try {
      return await settingsWrite.write(body);
    } finally {
      setPending(false);
    }
  };

  const once = async (
    change: (values: Values) => void,
  ): Promise<Outcome<SettingsBody>> => {
    const settings = await queryClient.fetchQuery({
      ...settingsQuery(place),
      staleTime: 0,
    });
    const body: SettingsBody = {
      values: settings.values ?? {},
      token: settings.token,
      confirm: false,
      keep_as_draft: false,
    };
    if (settings.values === null) {
      return {
        kind: 'refused',
        body,
        error: new ApiError({
          code: 'unreadable_settings',
          status: 0,
          title: 'The contest’s settings cannot be read',
          detail: settings.unreadable ?? undefined,
        }),
      };
    }
    const fresh = copyOf(settings.values);
    change(fresh);
    return settingsWrite.write({ ...body, values: fresh });
  };

  const apply = async (
    change: (values: Values) => void,
    { retry }: { retry: boolean },
  ) => {
    setPending(true);
    try {
      const outcome = await once(change);
      return retry && outcome.kind === 'refused' && outcome.error.code === 'conflict'
        ? await once(change)
        : outcome;
    } finally {
      setPending(false);
    }
  };

  return { apply, write, pending };
}
