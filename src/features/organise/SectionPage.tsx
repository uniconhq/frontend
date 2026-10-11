import type { ReactNode } from 'react';
import type { Section } from '@/lib/sections';
import { Page, PageHeader } from '@/ui/Page';

/**
 * A section's own page, titled as its card and its sidebar entry are, from
 * the same list. The breadcrumb above leads back up, so the page needs no
 * way back of its own. `links` are the page's links beside its title.
 */
export function SectionPage({
  section,
  links,
  intro,
  children,
}: {
  section: Section;
  links?: ReactNode;
  /** A line under the title, about what the section is for. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page>
      <PageHeader title={section.label} links={links}>
        {intro}
      </PageHeader>
      {children}
    </Page>
  );
}
