import type { ReactNode } from 'react';
import type { QueryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Loaded } from '@/ui/feedback/Loaded';
import { useOrganisersLine } from '../people/summary';
import type { RolePlace } from '../roles';

/** A hub card's line, with the one loading and failure pattern cards share. */
export function Line<T>({
  view,
  say,
}: {
  view: QueryView<T>;
  say: (data: T) => ReactNode;
}) {
  return (
    <Loaded view={view} compact>
      {(data) => <BodyText>{say(data)}</BodyText>}
    </Loaded>
  );
}

export function AnnouncementsLine({ view }: { view: QueryView<{ title: string }[]> }) {
  return (
    <Line
      view={view}
      say={(posted) => {
        const latest = posted.at(-1);
        return latest === undefined
          ? 'Nothing posted yet.'
          : `${String(posted.length)} posted; the latest is “${latest.title}”.`;
      }}
    />
  );
}

export function OrganisersLine({ place }: { place: RolePlace }) {
  return <Line view={useOrganisersLine(place)} say={(line) => line} />;
}
