import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { Section } from '@/lib/sections';
import { Page, PageHeader } from '@/ui/Page';
import { whenDrawn } from './contest/opened';

/** Whether anything drawn before `element` is still loading, and so will grow. */
function loadingAbove(element: Element): boolean {
  return [...document.querySelectorAll('[aria-label="Loading"]')].some(
    (loading) =>
      (loading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0,
  );
}

/**
 * The part of the page an address's anchor names (`#file`), scrolled to once
 * it is drawn and nothing above it is still loading, so it stays where it was
 * scrolled to; and again each time a link names it, from another page or from
 * this one.
 */
function useAnchor() {
  const { hash, key } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (id === '') return;
    return whenDrawn(
      () => {
        const found = document.getElementById(id);
        return found === null || loadingAbove(found) ? null : found;
      },
      (found) => found.scrollIntoView?.({ block: 'start' }),
    );
  }, [hash, key]);
}

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
  useAnchor();
  return (
    <Page>
      <PageHeader title={section.label} links={links}>
        {intro}
      </PageHeader>
      {children}
    </Page>
  );
}
