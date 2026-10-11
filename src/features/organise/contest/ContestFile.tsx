import type { ReactNode } from 'react';
import { useMe } from '@/session';
import { DefinitionForm, type FormProps } from '../forms/DefinitionFile';
import { holdsAt } from '../roles';
import { contestFieldName, contestValueWords } from './merge-words';
import { contestPlaceOf } from './opened';

/** The words the merge of two saves of the contest's settings uses. */
const WORDS = { field: contestFieldName, value: contestValueWords };

/**
 * A part of the contest's settings as a form: the settings read afresh as
 * the form opens, saved with the version they were read at. A save someone
 * else's beat opens the merge, each setting and value in words; a refused
 * save names each problem by where it is fixed, with a link that opens it.
 * `admin` says whether the organiser may change the admin's settings.
 */
export function ContestFile({
  org,
  contest,
  children,
}: {
  org: string;
  contest: string;
  children: (props: FormProps & { admin: boolean }) => ReactNode;
}) {
  const place = { kind: 'contest' as const, org, contest };
  const admin = holdsAt(useMe().roles, place, 'admin');
  return (
    <DefinitionForm
      place={place}
      path="contest.yaml"
      admin={admin}
      words={WORDS}
      placeOf={contestPlaceOf(org, contest)}
      bare
      readOnly
    >
      {(props) => children({ ...props, admin })}
    </DefinitionForm>
  );
}

/** A field's box, marked so a link naming the field can find and focus it. */
export function FieldBox({ name, children }: { name: string; children: ReactNode }) {
  return <div data-field={name}>{children}</div>;
}
