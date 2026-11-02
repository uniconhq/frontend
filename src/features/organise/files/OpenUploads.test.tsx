import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@/test/user-event';
import { server } from '@/test/server';
import { uploadInParts, type PartTransfer } from '@/api/upload/parts';
import { passTime, withFakeTimers } from '@/test/timers';
import { OpenUploads } from './OpenUploads';

const place = { kind: 'task' as const, org: 'acme', contest: 'spring', task: 'sum' };
const BASE = '/api/v1/orgs/acme/contests/spring/tasks/sum/organise/part-uploads';
const row: PartTransfer = {
  id: 'one',
  path: 'tests/data.bin',
  sha256: 'a'.repeat(64),
  size: 100,
  part_size: 16 * 1024 ** 2,
  status: 'open',
  reason: null,
  deadline_at: '2026-11-01T12:00:00Z',
  parts: [],
};

function show(rows: PartTransfer[]) {
  server.use(http.get(BASE, () => HttpResponse.json(rows)));
  const onChoose = vi.fn(() => Promise.resolve());
  const onStored = vi.fn(() => Promise.resolve());
  const onAborted = vi.fn();
  renderWithProviders(
    <OpenUploads
      place={place}
      disabled={false}
      onChoose={onChoose}
      onStored={onStored}
      onAborted={onAborted}
    />,
  );
  return { onChoose, onStored, onAborted };
}

describe('recovering uploads after a reload', () => {
  it('keeps the refusal reason when a finishing upload leaves the open list', async () => {
    show([{ ...row, status: 'finishing' }]);
    await screen.findByText(`${row.path}: finishing upload…`);
    server.use(
      http.get(BASE, () => HttpResponse.json([])),
      http.get(`${BASE}/one`, () =>
        HttpResponse.json({
          ...row,
          status: 'refused',
          reason: 'Forgejo refused these bytes',
        }),
      ),
    );
    await screen.findByText(
      `${row.path}: Forgejo refused these bytes`,
      {},
      { timeout: 10_000 },
    );
  });
  it('forgets the staged upload only after the server abort succeeds', async () => {
    server.use(
      http.delete(`${BASE}/one`, () =>
        HttpResponse.json({ ...row, status: 'aborted' }),
      ),
    );
    const { onAborted } = show([{ ...row, status: 'stored' }]);
    await userEvent.click(
      await screen.findByRole('button', { name: `Cancel upload of ${row.path}` }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Throw it away' }));
    await waitFor(() => expect(onAborted).toHaveBeenCalledWith(row.id));
  });
  it('keeps the staged upload when the server abort fails', async () => {
    let tried = false;
    server.use(
      http.delete(`${BASE}/one`, () => {
        tried = true;
        return HttpResponse.json(
          { code: 'internal', title: 'The upload could not be cancelled' },
          { status: 500 },
        );
      }),
    );
    const { onAborted } = show([{ ...row, status: 'stored' }]);
    await userEvent.click(
      await screen.findByRole('button', { name: `Cancel upload of ${row.path}` }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Throw it away' }));
    await waitFor(() => expect(tried).toBe(true));
    await screen.findByText('The upload could not be cancelled');
    expect(onAborted).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: `Use uploaded ${row.path}` }),
    ).toBeInTheDocument();
  });
  it('asks before throwing away an upload whose every part has arrived', async () => {
    let aborted = false;
    server.use(
      http.delete(`${BASE}/one`, () => {
        aborted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { onAborted } = show([{ ...row, status: 'finishing' }]);
    await userEvent.click(
      await screen.findByRole('button', { name: `Cancel upload of ${row.path}` }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      `All 100 B of ${row.path} has been sent.`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(aborted).toBe(false);
    expect(onAborted).not.toHaveBeenCalled();
  });
  it('dismisses a refused upload without asking', async () => {
    server.use(
      http.delete(`${BASE}/one`, () => new HttpResponse(null, { status: 204 })),
    );
    const { onAborted } = show([{ ...row, status: 'refused', reason: 'Too big' }]);
    await userEvent.click(
      await screen.findByRole('button', { name: `Dismiss ${row.path}` }),
    );
    await waitFor(() => expect(onAborted).toHaveBeenCalledWith(row.id));
    expect(
      screen.queryByRole('button', { name: `Cancel upload of ${row.path}` }),
    ).toBeNull();
  });
  it('leaves out an upload this tab is still sending until it stops', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signing = false;
    const other = { ...row, id: 'two', path: 'tests/other.bin' };
    server.use(
      http.post(BASE, () => HttpResponse.json(row)),
      http.get(`${BASE}/one`, () => HttpResponse.json(row)),
      http.post(`${BASE}/one/sign`, async () => {
        signing = true;
        await gate;
        return HttpResponse.json({ code: 'internal' }, { status: 500 });
      }),
    );
    show([row, other]);
    await screen.findByLabelText(`Resume ${row.path}`);
    const sending = uploadInParts(
      place,
      new File([new Uint8Array(row.size)], 'data.bin'),
      row.path,
      row.sha256,
      () => undefined,
      () => undefined,
    );
    await waitFor(() => expect(signing).toBe(true));
    await waitFor(() =>
      expect(screen.queryByLabelText(`Resume ${row.path}`)).toBeNull(),
    );
    expect(
      screen.queryByRole('button', { name: `Cancel upload of ${row.path}` }),
    ).toBeNull();
    expect(screen.getByLabelText(`Resume ${other.path}`)).toBeInTheDocument();
    release();
    await expect(sending).rejects.toThrow();
    await screen.findByLabelText(`Resume ${row.path}`);
  });
  it('keeps an upload whose part failed after its retries to resume', async () => {
    let puts = 0;
    let deleted = false;
    server.use(
      http.post(BASE, () => HttpResponse.json(row)),
      http.get(`${BASE}/one`, () => HttpResponse.json(row)),
      http.post(`${BASE}/one/sign`, () =>
        HttpResponse.json({ 1: '/unicon-uploads/one?partNumber=1' }),
      ),
      http.put('/unicon-uploads/one', () => {
        puts += 1;
        return new HttpResponse(null, { status: 503 });
      }),
      http.delete(`${BASE}/one`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    show([row]);
    await screen.findByLabelText(`Resume ${row.path}`);
    await expect(
      uploadInParts(
        place,
        new File([new Uint8Array(row.size)], 'data.bin'),
        row.path,
        row.sha256,
        () => undefined,
        () => undefined,
      ),
    ).rejects.toThrow();
    expect(puts).toBeGreaterThan(0);
    await screen.findByLabelText(`Resume ${row.path}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(deleted).toBe(false);
  }, 20_000);
  it('lists the server transfer and asks for its original file again', async () => {
    const { onChoose } = show([row]);
    const input = await screen.findByLabelText(`Resume ${row.path}`);
    const file = new File(['data'], 'data.bin');
    await userEvent.upload(input, file);
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(row, file));
  });
  it('keeps a verified but unsaved transfer available without resending its file', async () => {
    const stored = { ...row, status: 'stored' as const };
    const { onStored } = show([stored]);
    await userEvent.click(
      await screen.findByRole('button', { name: `Use uploaded ${row.path}` }),
    );
    await waitFor(() => expect(onStored).toHaveBeenCalledWith(stored));
  });
});

describe('reading the unfinished uploads again', () => {
  withFakeTimers();
  async function readsOver(rows: PartTransfer[]) {
    let reads = 0;
    server.use(
      http.get(BASE, () => {
        reads += 1;
        return HttpResponse.json(rows);
      }),
    );
    renderWithProviders(
      <OpenUploads
        place={place}
        disabled={false}
        onChoose={() => Promise.resolve()}
        onStored={() => Promise.resolve()}
        onAborted={() => undefined}
      />,
    );
    await waitFor(() => expect(reads).toBe(1));
    await passTime(16_000);
    return reads;
  }
  it('does not read again while nothing is under way', async () => {
    expect(await readsOver([])).toBe(1);
  });
  it('does not read again while every upload waits for someone here', async () => {
    expect(
      await readsOver([
        { ...row, status: 'stored' },
        { ...row, id: 'two', status: 'refused', reason: 'Too big' },
      ]),
    ).toBe(1);
  });
  it('reads again while an upload is open or finishing', async () => {
    expect(await readsOver([row])).toBeGreaterThanOrEqual(3);
  });
});
