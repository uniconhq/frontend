import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderWithProviders } from '@/test/render';
import { DateTimeInput } from './DateTimeInput';
import { RadioGroup } from './RadioGroup';
import { Select } from './Select';
import { TextInput } from './TextInput';

/** Whether `later` comes after `earlier` in the page, as it is read and laid out. */
function follows(earlier: Element, later: Element): boolean {
  return (
    (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
}

const noop = () => {};

describe('a field and its hint', () => {
  it.each([
    [
      'a text field',
      <TextInput key="t" label="Name" value="" onChange={noop} description="A hint." />,
    ],
    [
      'a choice',
      <Select
        key="s"
        label="Name"
        value=""
        options={[{ value: 'a', label: 'A' }]}
        onChange={noop}
        description="A hint."
      />,
    ],
    [
      'a time',
      <DateTimeInput
        key="d"
        label="Name"
        value=""
        onChange={noop}
        description="A hint."
      />,
    ],
  ])('puts the hint under the box in %s, so boxes side by side line up', (_, field) => {
    renderWithProviders(field);

    const box = screen.getByLabelText('Name');
    const hint = screen.getByText('A hint.');
    expect(follows(box, hint)).toBe(true);
    expect(box).toHaveAccessibleDescription('A hint.');
  });

  it('puts what was refused under the box too', () => {
    renderWithProviders(
      <TextInput label="Name" value="" onChange={noop} error="It is taken." />,
    );

    expect(
      follows(screen.getByLabelText('Name'), screen.getByText('It is taken.')),
    ).toBe(true);
  });
});

describe('a field with background behind an ⓘ', () => {
  const field = (
    <TextInput
      label="Worth"
      value=""
      onChange={noop}
      placeholder="100"
      info="The most points the task gives."
    />
  );

  it('is still named by its label alone, with the ⓘ beside it', () => {
    renderWithProviders(field);

    expect(screen.getByRole('textbox', { name: 'Worth' })).toHaveAttribute(
      'placeholder',
      '100',
    );
    expect(screen.getByRole('button', { name: 'About Worth' })).toBeVisible();
    expect(screen.queryByText('The most points the task gives.')).toBeNull();
  });

  it('opens on a click, and closes on Escape', async () => {
    renderWithProviders(field);

    await userEvent.click(screen.getByRole('button', { name: 'About Worth' }));
    expect(await screen.findByText('The most points the task gives.')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('The most points the task gives.')).toBeNull();
  });

  it('opens from the keyboard', async () => {
    renderWithProviders(field);

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'About Worth' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('The most points the task gives.')).toBeVisible();
  });

  it('closes on a second tap on a touch screen', async () => {
    renderWithProviders(field);
    const button = screen.getByRole('button', { name: 'About Worth' });

    // A tap fires the browser's stand-in mouseenter, then a click; a second
    // tap only the click, the stand-in mouse being over it still.
    fireEvent.mouseEnter(button);
    fireEvent.click(button);
    expect(await screen.findByText('The most points the task gives.')).toBeVisible();
    fireEvent.click(button);
    expect(screen.queryByText('The most points the task gives.')).toBeNull();
  });

  it('opens while the pointer is over it', async () => {
    renderWithProviders(field);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'About Worth' }));
    expect(await screen.findByText('The most points the task gives.')).toBeVisible();
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'About Worth' }));
    expect(screen.queryByText('The most points the task gives.')).toBeNull();
  });
});

describe('a choice of a few, as radio options', () => {
  const options = [
    { value: 'all', label: 'Every test must pass', description: 'All or nothing.' },
    {
      value: 'worst',
      label: 'The lowest test score counts',
      description: 'A test scored 0.4 gives 40%.',
      disabled: true,
      reason: 'Needs tests that earn part of their points.',
    },
  ];

  it('says under each option what it means, and under a greyed one why', () => {
    renderWithProviders(
      <RadioGroup label="Rule" value="all" options={options} onChange={noop} />,
    );

    expect(screen.getByRole('radio', { name: 'Every test must pass' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Every test must pass' }),
    ).toHaveAccessibleDescription('All or nothing.');
    const greyed = screen.getByRole('radio', { name: 'The lowest test score counts' });
    expect(greyed).toBeDisabled();
    expect(greyed).toHaveAccessibleDescription(
      'A test scored 0.4 gives 40%. Needs tests that earn part of their points.',
    );
    expect(
      screen.getByRole('radiogroup', { name: 'Rule' }),
    ).not.toHaveAccessibleDescription(/Needs tests/);
  });

  it('says what was refused about the option chosen under the options', () => {
    renderWithProviders(
      <RadioGroup
        label="Rule"
        value="all"
        options={options}
        onChange={noop}
        error="Not with these tests."
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Rule' });
    expect(
      follows(
        screen.getByRole('radio', { name: 'Every test must pass' }),
        screen.getByText('Not with these tests.'),
      ),
    ).toBe(true);
    expect(group).toBeInTheDocument();
  });
});
