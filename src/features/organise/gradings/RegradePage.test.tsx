import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';

const PAGE = '/orgs/acme/contests/spring/tasks/sum/regrades/r1';

describe('a regrade', () => {
  it('shows a row moving', async () => {
    server.use(
      signedIn,
      http.get(
        '/api/v1/orgs/:org/contests/:contest/tasks/:task/regrades/:regrade',
        () =>
          HttpResponse.json({
            id: 'r1',
            cause: { kind: 'save', publication: 2 },
            publication: 2,
            total: 1,
            running: 0,
            failed: 0,
            unread: 0,
            more_changed: 0,
            changed: [
              {
                grading: 'g1',
                number: 4,
                more_verdicts: 0,
                values: [],
                verdicts: [
                  { run: 'r1', runs: 1, before: 'accepted', after: 'wrong_answer' },
                ],
              },
            ],
            leaderboards: [
              {
                leaderboard: 'gradebook',
                title: 'Gradebook',
                unread: false,
                headers: [],
                sort: [],
                rows: [
                  {
                    row: { entrant: 'ada', name: 'ada' },
                    place_before: 3,
                    place_after: 1,
                    regrading: [],
                    cells: [
                      {
                        column: 'points',
                        before: '1',
                        after: '2',
                        text_before: null,
                        text_after: null,
                        waiting: [],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
      ),
    );
    renderApp(PAGE);
    expect(await screen.findByRole('table', { name: 'Gradebook' })).toHaveTextContent(
      'moved from 3 to 1',
    );
    expect(screen.getByRole('table', { name: 'Gradebook' })).toHaveTextContent(
      'points 1 → 2',
    );
    expect(screen.getByRole('list', { name: 'Changed submissions' })).toHaveTextContent(
      'Run r1 accepted → wrong_answer',
    );
  });

  it('shows the changed values when the leaderboards are not given', async () => {
    server.use(
      signedIn,
      http.get(
        '/api/v1/orgs/:org/contests/:contest/tasks/:task/regrades/:regrade',
        () =>
          HttpResponse.json({
            id: 'r1',
            cause: { kind: 'save', publication: 2 },
            publication: 2,
            total: 1,
            running: 0,
            failed: 0,
            unread: 0,
            more_changed: 2,
            changed: [
              {
                grading: 'g1',
                number: 4,
                more_verdicts: 0,
                values: [
                  {
                    name: 'points',
                    before: '1',
                    after: '2',
                    text_before: null,
                    text_after: null,
                    waiting: false,
                  },
                ],
                verdicts: [],
              },
            ],
            leaderboards: null,
          }),
      ),
    );
    renderApp(PAGE);
    const list = await screen.findByRole('list', { name: 'Changed submissions' });
    expect(list).toHaveTextContent('Submission 4 points 1 → 2');
    expect(list).toHaveTextContent('2 more submissions changed.');
    expect(screen.queryByText('No leaderboard reads this task.')).toBeNull();
  });
});
