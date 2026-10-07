import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Marks } from '@/api/types';
import { accepted, grading, submission, TASK_API, taskPage } from '@/test/contestant';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';

const PAGE = '/contests/acme/spring/tasks/sum';

const listed = [
  submission(3, grading()),
  submission(2, accepted),
  submission(1, accepted),
];

/**
 * The marks routes over one set the row holds, refusing a mark past `most`
 * with its limit, and any change once `frozen`, as the server does.
 */
function marksHeld(start: Partial<Marks> = {}) {
  const held: Marks = {
    numbers: [],
    most: 2,
    closes_at: '2026-09-12T10:30:00Z',
    frozen: false,
    ...start,
  };
  const answer = () => HttpResponse.json({ ...held, numbers: [...held.numbers] });
  return [
    http.get(`${TASK_API}/page`, () => HttpResponse.json(taskPage)),
    http.get(`${TASK_API}/submissions`, () => HttpResponse.json(listed)),
    http.get(`${TASK_API}/marks`, answer),
    http.put(`${TASK_API}/marks/:number`, ({ params }) => {
      const number = Number(params.number);
      if (held.frozen) return problem(403, 'marks_frozen');
      if (!held.numbers.includes(number)) {
        if (held.numbers.length >= held.most) {
          return problem(409, 'mark_limit', { limit: held.most });
        }
        held.numbers.push(number);
      }
      return answer();
    }),
    http.delete(`${TASK_API}/marks/:number`, ({ params }) => {
      if (held.frozen) return problem(403, 'marks_frozen');
      held.numbers = held.numbers.filter((found) => found !== Number(params.number));
      return answer();
    }),
  ];
}

describe("a contestant's marks", () => {
  it('marks up to the most the task counts, a grading one alike, and refuses one more', async () => {
    server.use(signedIn, ...marksHeld());
    const user = userEvent.setup();
    renderApp(PAGE);

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    await user.click(await within(list).findByRole('checkbox', { name: 'Mark #3' }));
    await waitFor(() =>
      expect(within(list).getByRole('checkbox', { name: 'Mark #3' })).toBeChecked(),
    );
    await user.click(within(list).getByRole('checkbox', { name: 'Mark #2' }));
    await waitFor(() =>
      expect(within(list).getByRole('checkbox', { name: 'Mark #2' })).toBeChecked(),
    );
    expect(screen.getByText(/^Marked 2 of 2\./)).toBeVisible();

    await user.click(within(list).getByRole('checkbox', { name: 'Mark #1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This task counts at most 2 marked submissions.',
    );
    expect(within(list).getByRole('checkbox', { name: 'Mark #1' })).not.toBeChecked();

    await user.click(within(list).getByRole('checkbox', { name: 'Mark #3' }));
    await waitFor(() =>
      expect(within(list).getByRole('checkbox', { name: 'Mark #3' })).not.toBeChecked(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the marks as final, with no toggle, after the close', async () => {
    server.use(signedIn, ...marksHeld({ numbers: [2], frozen: true }));
    renderApp(PAGE);

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    expect(
      await screen.findByText('Your marks are final: 1 of 2 marked.'),
    ).toBeVisible();
    expect(within(list).queryByRole('checkbox')).toBeNull();
    expect(within(list).getByText('Marked')).toBeVisible();
  });

  it('offers no mark on a task no board counts marks on', async () => {
    server.use(
      signedIn,
      http.get(`${TASK_API}/page`, () => HttpResponse.json(taskPage)),
      http.get(`${TASK_API}/submissions`, () => HttpResponse.json(listed)),
    );
    renderApp(PAGE);

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    expect(within(list).queryByRole('columnheader', { name: 'Mark' })).toBeNull();
    expect(within(list).queryByRole('checkbox')).toBeNull();
  });
});
