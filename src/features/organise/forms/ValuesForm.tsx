import { useState, type ReactNode } from 'react';
import { toApiError } from '@/api/problem';
import type { DefinitionError } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { PageLink } from '@/ui/PageLink';
import { taskSectionPath } from '@/lib/sections';
import { STORED, viewFilePath } from '../contest/places';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import type { Place } from '../files/place';
import { definitionErrorsOf } from '../files/refusals';
import type { ProblemPlace } from '../DefinitionErrors';
import type { ProblemPath } from '../problem-path';
import { useOwnSettings, useSettingsWrite, type SettingsBody } from './settings-hooks';
import { copyOf, type Values } from './values';

/**
 * What a form is handed: the settings as read, the way to save a change to
 * them, and what the last save was refused for, each at its path in the
 * file, so a form can say it on the field that caused it.
 */
export type ValuesFormProps = {
  values: Values;
  busy: boolean;
  /** Whether the last save asks before it publishes. */
  asking: boolean;
  /** Whether the last save went through. */
  saved: boolean;
  /** Apply the form's changes to a copy of the values as read and save them. */
  onSave: (change: (values: Values) => void) => void;
  refused: DefinitionError[];
};

/** Where a problem is fixed; `sent` is the values the refused save sent. */
export type ValuesPlaceOf = (
  path: ProblemPath,
  message: string,
  sent?: Values,
) => ProblemPlace;

/** Where a place's settings are kept as stored, which an admin mends as text. */
function mendAt(place: Place): string {
  return place.kind === 'task'
    ? `${taskSectionPath(place.org, place.contest, place.task, 'settings')}#${STORED}`
    : viewFilePath(place.org, place.contest);
}

/**
 * A place's settings as a form. Saving sends every value with the token they
 * were read at; the server writes them into the file. A save someone else's
 * beat is refused as a conflict, to be read again. Settings that do not read
 * are no form: it says why, and where an admin mends them as text.
 */
export function ValuesForm({
  place,
  children,
  placeOf,
  bare = false,
}: {
  place: Place;
  children: (props: ValuesFormProps) => ReactNode;
  placeOf?: ValuesPlaceOf;
  bare?: boolean;
}) {
  const query = useOwnSettings(place);
  const { write } = useSettingsWrite(place);
  const [outcome, setOutcome] = useState<Outcome<SettingsBody> | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (body: SettingsBody) => {
    setOutcome(null);
    setBusy(true);
    try {
      const answer = await write(body);
      setOutcome(answer);
      if (answer.kind !== 'refused') await query.refetch();
    } finally {
      setBusy(false);
    }
  };

  if (query.isPending) return <PageSkeleton rows={6} />;
  if (query.data === undefined) {
    return (
      <ErrorBlock
        error={toApiError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const settings = query.data;
  const values = settings.values;

  return (
    <div>
      {values === null ? (
        <div role="alert">
          <BodyText>
            These settings cannot be read, so they cannot be changed here.
          </BodyText>
          {settings.unreadable !== null && (
            <BodyText tone="secondary">{settings.unreadable}</BodyText>
          )}
          <BodyText tone="secondary">
            Fix them as text in{' '}
            <PageLink to={mendAt(place)}>the stored settings</PageLink>.
          </BodyText>
        </div>
      ) : (
        <div key={settings.token ?? ''}>
          {children({
            values,
            busy,
            saved: outcome !== null && outcome.kind !== 'refused',
            asking:
              outcome?.kind === 'refused' &&
              outcome.error.code === 'confirmation_required',
            refused:
              outcome?.kind === 'refused' && outcome.error.code === 'invalid_definition'
                ? definitionErrorsOf(outcome.error)
                : [],
            onSave: (change) => {
              const fresh = copyOf(values);
              change(fresh);
              void send({
                values: fresh,
                token: settings.token,
                confirm: false,
                keep_as_draft: false,
              });
            },
          })}
        </div>
      )}
      {outcome !== null && (
        <SaveOutcome
          outcome={outcome}
          placeOf={
            placeOf === undefined
              ? undefined
              : outcome.kind !== 'refused'
                ? (where, message) => placeOf(where, message)
                : (where, message) => placeOf(where, message, outcome.body.values)
          }
          bare={bare}
          onConfirm={(body, asked) => void send({ ...body, confirm: true, asked })}
          onKeepAsDraft={
            place.kind === 'task'
              ? (body) => void send({ ...body, keep_as_draft: true })
              : undefined
          }
          onCancel={() => setOutcome(null)}
          onReload={() => {
            setOutcome(null);
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}
