import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { ContestHome, MyRegistration } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { t } from '@/lib/t';
import classes from './contest.module.css';

type Standing = { title: string; message: string };

/** What a registration that exists says, by where it stands. */
function standing(registration: MyRegistration): Standing {
  switch (registration.status) {
    case 'pending':
      return {
        title: t('Your registration is waiting'),
        message: t('An organiser decides it. This page moves on when they do.'),
      };
    case 'rejected':
      return {
        title: t('Your registration was not accepted'),
        message: registration.reason ?? t('The organisers gave no reason.'),
      };
    case 'approved':
      return {
        title: t('You are in'),
        message: t('Submit to any task that is open.'),
      };
    case 'removed':
      return {
        title: t('You were removed from this contest'),
        message: t('Your submissions stay, and you can no longer add to them.'),
      };
    case 'withdrawn':
      return {
        title: t('You withdrew from this contest'),
        message: t('Your submissions stay, and you can no longer add to them.'),
      };
  }
}

/**
 * Where something stands, as a status the page reads out. `focused` takes the
 * focus as it appears, for the answer to the person's own click, whose button
 * has just gone.
 */
function Status({ title, message, focused }: Standing & { focused: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) panel.current?.focus();
  }, [focused]);
  return (
    <div
      ref={panel}
      className={classes.panel}
      role="status"
      aria-label={t('Registration')}
      tabIndex={-1}
    >
      <BodyText>{title}</BodyText>
      <BodyText tone="secondary">{message}</BodyText>
    </div>
  );
}

/**
 * The register button and what came back, or where the caller's registration
 * stands. A refusal is said in words from its code, such as registration being
 * closed or the contest being full. The registration that comes back is put in
 * the contest's home at once, so the form cannot be sent twice, and the home
 * and the list of contests are read again for the rest.
 */
export function RegistrationPanel({
  org,
  contest,
  home,
}: {
  org: string;
  contest: string;
  home: ContestHome;
}) {
  const queryClient = useQueryClient();
  const register = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/registration',
  );
  const [code, setCode] = useState('');

  if (home.registration !== null) {
    return <Status {...standing(home.registration)} focused={register.isSuccess} />;
  }
  if (home.organises) {
    return (
      <Status
        title={t('You organise this contest')}
        message={t('Someone with a role in a contest cannot also enter it.')}
        focused={false}
      />
    );
  }
  if (!home.registration_open) {
    return (
      <Status
        title={t('Registration is closed')}
        message={t('This contest is not taking registrations right now.')}
        focused={false}
      />
    );
  }

  const homeKey = $api.queryOptions(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/home',
    {
      params: { path: { org, contest } },
    },
  ).queryKey;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let registration: MyRegistration;
    try {
      registration = await register.mutateAsync({
        params: { path: { org, contest } },
        body: { invite_code: home.asks_code ? code : null },
      });
    } catch {
      // The refusal is the mutation's `error`, shown below the button.
      return;
    }
    queryClient.setQueryData<ContestHome>(homeKey, (current) =>
      current === undefined ? current : { ...current, registration },
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: homeKey }),
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', '/api/v1/contests').queryKey,
      }),
    ]);
  };

  return (
    <form
      className={classes.form}
      aria-label={t('Register')}
      onSubmit={(event) => void submit(event)}
    >
      {home.invite_only && (
        <BodyText tone="secondary">
          {t('This contest takes only the people its organisers invite.')}
        </BodyText>
      )}
      {home.asks_code && (
        <TextInput
          label={t('Contest code')}
          description={t('The code the organisers gave you.')}
          value={code}
          onChange={setCode}
          required
        />
      )}
      <div>
        <Button type="submit" loading={register.isPending}>
          {t('Register')}
        </Button>
      </div>
      {register.error !== null && (
        <div role="alert">
          <ErrorBlock error={register.error} compact />
        </div>
      )}
    </form>
  );
}
