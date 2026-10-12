import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { ListCard, type ListRow } from './ListCard';

function rows(count: number): ListRow[] {
  return Array.from({ length: count }, (_, at) => ({
    key: String(at),
    to: `/orgs/org-${String(at)}`,
    name: `org-${String(at)}`,
    text: `org-${String(at)}`,
  }));
}

function renderCard(count: number) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <ListCard title="Your orgs" rows={rows(count)} empty="No orgs yet." />,
    },
  ]);
  renderWithProviders(<RouterProvider router={router} />);
}

/** The box the rows scroll in, laid out as a browser would with these sizes. */
function laidOut(sizes: { scrollHeight: number; clientHeight: number }): HTMLElement {
  const box = screen.getByRole('list', { name: 'Your orgs' }).parentElement;
  if (box === null) throw new Error('The list has no box.');
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(box, name, { value, configurable: true });
  }
  return box;
}

function scrollTo(box: HTMLElement, top: number) {
  Object.defineProperty(box, 'scrollTop', { value: top, configurable: true });
  fireEvent.scroll(box);
}

describe('a list card’s rows', () => {
  it('fade at the bottom edge while more rows are below, and not once the end is reached', () => {
    renderCard(12);
    const box = laidOut({ scrollHeight: 672, clientHeight: 336 });

    scrollTo(box, 0);
    expect(box).toHaveAttribute('data-more');

    scrollTo(box, 200);
    expect(box).toHaveAttribute('data-more');

    scrollTo(box, 336);
    expect(box).not.toHaveAttribute('data-more');

    scrollTo(box, 100);
    expect(box).toHaveAttribute('data-more');
  });

  it('do not fade when they all fit', () => {
    renderCard(3);
    const box = laidOut({ scrollHeight: 168, clientHeight: 168 });

    scrollTo(box, 0);
    expect(box).not.toHaveAttribute('data-more');
  });

  it('leave a short line, not a tall empty box, when there are none', () => {
    renderCard(0);

    expect(screen.getByText('No orgs yet.')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Your orgs' })).toBeNull();
  });
});
