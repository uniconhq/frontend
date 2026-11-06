import type { ReactNode } from 'react';
import { BodyText } from '@/ui/BodyText';
import type { RolePlace } from './roles';
import { ReadOnlyAt } from './ReadOnlyAt';
import type { Section } from '@/lib/sections';
import { Page, PageHeader } from '@/ui/Page';
import { useAnchor } from '@/ui/anchor';

/**
 * A section's own page, titled as its card and crumb are. `links` sit beside
 * the title, with the read-only note for `place` unless `allowed`.
 */
export function SectionPage({
  section,
  place,
  allowed = true,
  links,
  intro,
  children,
}: {
  section: Section;
  place?: RolePlace;
  /** Whether the server says the caller may change what the section shows. */
  allowed?: boolean;
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
            {place !== undefined && <ReadOnlyAt place={place} allowed={allowed} />}
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
