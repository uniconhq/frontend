import type { ReactNode } from 'react';
import type { QueryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Loaded } from '@/ui/feedback/Loaded';
import { useOrganisersLine } from '../people/summary';
import type { RolePlace } from '../roles';

/**
 * A hub card's line once its read is in, with the one loading and failure
 * pattern a card has: a grey line, then the words, or the failure and a
 * retry.
 */
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

/** How many announcements there are, and the latest one's title. */
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

/** How many organise a place, and how many invites to join them are pending. */
export function OrganisersLine({ place }: { place: RolePlace }) {
  return <Line view={useOrganisersLine(place)} say={(line) => line} />;
}
