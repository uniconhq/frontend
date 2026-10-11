import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CLASSIC_V2, PRIMITIVES } from '@/test/workflows';
import { DrawnGraph } from './DrawnGraph';
import { layoutWorkflow } from './layout';
import { workflowOf } from './edit';
import { byRef } from './primitives';

describe('a workflow drawn', () => {
  it('stands at its actual size, never scaled, with no logo in its corner', async () => {
    const { container } = renderWithProviders(
      <DrawnGraph text={CLASSIC_V2} primitives={PRIMITIVES} />,
    );
    await screen.findByRole('group', { name: 'Step run' });
    const layout = layoutWorkflow(workflowOf(CLASSIC_V2), byRef(PRIMITIVES));

    const viewport = container.querySelector<HTMLElement>('.react-flow__viewport');
    expect(viewport?.style.transform.replaceAll(' ', '')).toBe(
      'translate(32px,32px)scale(1)',
    );
    const canvas = viewport?.closest('.react-flow')?.parentElement;
    expect(canvas?.style.width).toBe(`${String(layout.width + 64)}px`);
    expect(canvas?.style.height).toBe(`${String(layout.height + 64)}px`);
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
  });
});
