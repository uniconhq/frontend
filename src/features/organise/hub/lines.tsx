import type { ReactNode } from 'react';
import type { QueryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Loaded } from '@/ui/feedback/Loaded';
import { useOrganisersLine } from '../people/summary';
import type { RolePlace } from '../roles';
import { count } from './count';

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

/**
 * What Files leaves to pages of their own, and its hub card leaves out too:
 * the settings files and a task's tests.
 */
const ELSEWHERE = new Set(['task.yaml', 'contest.yaml', 'tests']);

/** The top of a place's files, by name, but for its settings and tests: a few, and how many more. */
export function FilesLine({ view }: { view: QueryView<{ path: string }[]> }) {
  return (
    <Line
      view={view}
      say={(all) => {
        const entries = all.filter((entry) => !ELSEWHERE.has(entry.path));
        if (entries.length === 0) return 'No files yet.';
        const names = entries.slice(0, 3).map((entry) => entry.path);
        const more = entries.length - names.length;
        return more === 0
          ? names.join(', ')
          : `${names.join(', ')} and ${count(more, 'more', 'more')}`;
      }}
    />
  );
}

/** How many organise a place, and how many invites to join them are pending. */
export function OrganisersLine({ place }: { place: RolePlace }) {
  return <Line view={useOrganisersLine(place)} say={(line) => line} />;
}
