import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { specCatalogue } from '../formula/catalogue';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import userEvent from '@/test/user-event';

describe('the formula page', () => {
  it('checks islands total and ICPC a_tries against the blocks', async () => {
    server.use(http.get('/api/v1/blocks', () => HttpResponse.json(specCatalogue())));
    renderApp('/dev/stage-6/formula');
    expect(await screen.findByText('40 times st1 plus 60 times st2.')).toBeVisible();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Example' }),
      'a_tries',
    );
    expect(screen.getByRole('textbox', { name: 'a_tries' })).toHaveTextContent(
      'count(a, a.compiled == 1 and a.solved == 0',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Example' }),
      'first_failed',
    );
    expect(screen.getByText(/or “none” when that is missing/)).toBeVisible();
  });

  it('says when the blocks cannot be loaded, and does not check against a stand-in', async () => {
    server.use(
      http.get('/api/v1/blocks', () =>
        HttpResponse.json({ message: 'no' }, { status: 500 }),
      ),
    );
    renderApp('/dev/stage-6/formula');
    expect(
      await screen.findByText(
        'The blocks could not be loaded, so a formula cannot be checked.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'total' })).not.toBeInTheDocument();
  });
});
