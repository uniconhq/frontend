import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { renderWithProviders } from '@/test/render';
import { CodeEditor } from './CodeEditor';

// The test setup stands a text field in for the editor everywhere else.
vi.unmock('./CodeEditor');

/** The CodeMirror view behind the editing area named `label`. */
function viewOf(label: string): EditorView {
  const content = screen.getByRole('textbox', { name: label });
  const view = EditorView.findFromDOM(content);
  if (view === null) throw new Error(`no editor named ${label}`);
  return view;
}

/** An edit as the person would make it, at the end of the text. */
function typeAtEnd(view: EditorView, text: string) {
  const end = view.state.doc.length;
  view.dispatch({ changes: { from: end, insert: text }, userEvent: 'input.type' });
}

describe('the code editor', () => {
  it('shows the text in an editing area named by its label', () => {
    renderWithProviders(
      <CodeEditor label="task.yaml" value={'name: sum\n'} onChange={() => {}} />,
    );

    const content = screen.getByRole('textbox', { name: 'task.yaml' });
    expect(content).toHaveAttribute('contenteditable', 'true');
    expect(content).toHaveAttribute('aria-readonly', 'false');
    expect(viewOf('task.yaml').state.doc.toString()).toBe('name: sum\n');
  });

  it('hands every edit back, and takes a new value without handing it back', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <CodeEditor label="notes.txt" value="one" onChange={onChange} />,
    );

    typeAtEnd(viewOf('notes.txt'), ' two');
    expect(onChange).toHaveBeenLastCalledWith('one two');

    onChange.mockClear();
    rerender(<CodeEditor label="notes.txt" value="three" onChange={onChange} />);
    expect(viewOf('notes.txt').state.doc.toString()).toBe('three');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the text as it is while read-only, and lets go after', () => {
    const { rerender } = renderWithProviders(
      <CodeEditor label="notes.txt" value="one" onChange={() => {}} readOnly />,
    );

    expect(viewOf('notes.txt').state.readOnly).toBe(true);
    expect(screen.getByRole('textbox', { name: 'notes.txt' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );

    rerender(<CodeEditor label="notes.txt" value="one" onChange={() => {}} />);
    expect(viewOf('notes.txt').state.readOnly).toBe(false);
  });

  it('highlights YAML and Markdown, and leaves plain text plain', () => {
    renderWithProviders(
      <>
        <CodeEditor label="task.yaml" value={'name: sum\n'} language="yaml" />
        <CodeEditor label="statement.md" value={'# Sum\n'} language="markdown" />
        <CodeEditor label="1.in" value={'name: sum\n'} />
      </>,
    );

    const spans = (label: string) =>
      screen.getByRole('textbox', { name: label }).querySelectorAll('.cm-line span');
    expect(spans('task.yaml').length).toBeGreaterThan(0);
    expect(spans('statement.md').length).toBeGreaterThan(0);
    expect(spans('1.in')).toHaveLength(0);
  });

  it('moves the focus into the editing area from its label, and on autoFocus', async () => {
    renderWithProviders(
      <>
        <CodeEditor label="first" value="" autoFocus />
        <CodeEditor label="second" value="" />
      </>,
    );

    expect(viewOf('first').hasFocus).toBe(true);
    await userEvent.click(screen.getByText('second'));
    expect(viewOf('second').hasFocus).toBe(true);
  });
});
