import type { ReactNode } from 'react';
import { ValuesForm, type ValuesFormProps } from '../forms/ValuesForm';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { usePlaceMayRead } from '../may';
import { contestPlaceOf } from './opened';
import shared from '../organise.module.css';

/**
 * A part of the contest's settings as a form: the settings read afresh as
 * the form opens, saved as values with the version they were read at. A
 * refused save names each problem by where it is fixed, with a link that
 * opens it. `admin` says whether the organiser may change the admin's
 * settings.
 */
export function ContestFile({
  org,
  contest,
  children,
}: {
  org: string;
  contest: string;
  children: (props: ValuesFormProps & { admin: boolean }) => ReactNode;
}) {
  const place = { kind: 'contest' as const, org, contest };
  const may = usePlaceMayRead(place);
  // A form opened by a link focuses its field once, so it waits to be editable.
  if (may === undefined) return <PageSkeleton rows={6} />;
  return (
    <ValuesForm
      place={place}
      placeOf={(path, _message, sent) => contestPlaceOf(org, contest, sent)(path)}
      bare
    >
      {(props) => children({ ...props, admin: may.edit_admin_settings })}
    </ValuesForm>
  );
}

/**
 * A field's box, marked so a link naming the field can find and focus it.
 * What it holds stands one under the other, a form's gap apart, such as a
 * choice and the field it opens.
 */
export function FieldBox({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div data-field={name} className={shared.fieldBox}>
      {children}
    </div>
  );
}
