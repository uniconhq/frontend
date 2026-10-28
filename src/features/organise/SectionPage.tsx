import type { ReactNode } from 'react';
import type { RoleName } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import type { RolePlace } from './roles';
import { ReadOnlyAt } from './ReadOnlyAt';
import type { Section } from '@/lib/sections';
import { Page, PageHeader } from '@/ui/Page';
import { useAnchor } from '@/ui/anchor';

/**
 * A section's own page, titled as its card and its sidebar entry are, from
 * the same list. The breadcrumb above leads back up, so the page needs no
 * way back of its own. `links` are the page's links beside its title.
 */
export function SectionPage({
  section,
  place,
  role,
  links,
  intro,
  children,
}: {
  section: Section;
  place?: RolePlace;
  role?: RoleName;
  links?: ReactNode;
  /** A line under the title, about what the section is for. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  useAnchor();
  return (
    <Page>
      <PageHeader
        title={section.label}
        links={
          <>
            {place !== undefined && <ReadOnlyAt place={place} role={role} />}
            {links}
          </>
        }
      >
        {section.line !== undefined && (
          <BodyText tone="secondary">{section.line}</BodyText>
        )}
        {intro}
      </PageHeader>
      {children}
    </Page>
  );
}
