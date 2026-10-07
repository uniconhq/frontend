import { useEffect, useId, useRef } from 'react';
import { Input } from '@mantine/core';
import { basicSetup } from 'codemirror';
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';
import { tags } from '@lezer/highlight';
import classes from './CodeEditor.module.css';

/** What the text is highlighted as. Anything else is plain text. */
export type CodeLanguage = 'yaml' | 'markdown' | 'plain';

function languageExtension(language: CodeLanguage): Extension {
  if (language === 'yaml') return yaml();
  if (language === 'markdown') return markdown();
  return [];
}

/**
 * The editor's colours are the theme's own, as CSS variables, so it follows
 * the colour scheme without being built again; CodeMirror's default
 * highlighting is drawn for a light page and fades on the dark one.
 */
const look = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    color: 'var(--unicon-text-primary)',
    backgroundColor: 'var(--unicon-body)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--mantine-font-family-monospace)',
    lineHeight: '1.5',
  },
  '.cm-content': { caretColor: 'var(--unicon-text-primary)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--unicon-text-primary)' },
  '.cm-gutters': {
    backgroundColor: 'var(--unicon-chrome)',
    color: 'var(--unicon-text-meta)',
    borderRight: '1px solid var(--unicon-border)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--unicon-hover)',
    color: 'var(--unicon-text-body)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--unicon-border-strong)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--unicon-hover)' },
  '.cm-panels': {
    backgroundColor: 'var(--unicon-chrome)',
    color: 'var(--unicon-text-body)',
  },
});

const highlighting = HighlightStyle.define([
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName)],
    color: 'var(--unicon-text-accent)',
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.keyword],
    color: 'var(--unicon-text-accent)',
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--unicon-text-body)' },
  { tag: tags.comment, color: 'var(--unicon-text-meta)', fontStyle: 'italic' },
  {
    tag: [tags.meta, tags.punctuation, tags.separator, tags.processingInstruction],
    color: 'var(--unicon-text-secondary)',
  },
  { tag: tags.heading, color: 'var(--unicon-text-primary)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  {
    tag: [tags.link, tags.url],
    color: 'var(--unicon-text-accent)',
    textDecoration: 'underline',
  },
  { tag: tags.monospace, color: 'var(--unicon-text-body)' },
]);

/** Marks a change that came from `value` rather than from the person typing. */
const fromValue = Annotation.define<boolean>();

/**
 * A code editor: CodeMirror with its basic setup (line numbers, undo, search,
 * bracket matching, the keyboard commands people expect), highlighting YAML
 * or Markdown when told the text is one. It is controlled like a field:
 * `value` is the text, and every edit the person makes comes back through
 * `onChange`; a new `value` from outside replaces the text without coming
 * back, and outside the undo history. `readOnly` keeps the text as it is but
 * still lets it be read, selected and copied. The label is shown above it and
 * is the editing area's accessible name, and clicking it moves the focus in.
 * It is `rows` lines tall and the person can drag it taller.
 *
 * Tests run under jsdom, which has no layout for CodeMirror to measure, so
 * the test setup stands a plain text field in for this component, with the
 * same props; `CodeEditor.test.tsx` covers this one itself.
 */
export function CodeEditor({
  label,
  value,
  onChange,
  language = 'plain',
  readOnly = false,
  autoFocus = false,
  rows = 18,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  language?: CodeLanguage;
  readOnly?: boolean;
  autoFocus?: boolean;
  rows?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const labelId = useId();
  const changed = useRef(onChange);
  const languageSlot = useRef(new Compartment());
  const readOnlySlot = useRef(new Compartment());
  /** What the editor starts from; the effects below keep it in step after. */
  const start = useRef({ value, language, readOnly, autoFocus });

  useEffect(() => {
    changed.current = onChange;
  });

  useEffect(() => {
    if (host.current === null) return;
    const initial = start.current;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          basicSetup,
          look,
          syntaxHighlighting(highlighting),
          languageSlot.current.of(languageExtension(initial.language)),
          readOnlySlot.current.of(readOnlyExtension(initial.readOnly)),
          EditorView.contentAttributes.of({ 'aria-labelledby': labelId }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.some((tr) => tr.annotation(fromValue) === true))
              return;
            changed.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    if (initial.autoFocus) created.focus();
    return () => {
      created.destroy();
      view.current = null;
    };
  }, [labelId]);

  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    const text = current.state.doc.toString();
    if (text === value) return;
    current.dispatch({
      changes: { from: 0, to: text.length, insert: value },
      annotations: [fromValue.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: languageSlot.current.reconfigure(languageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlySlot.current.reconfigure(readOnlyExtension(readOnly)),
    });
  }, [readOnly]);

  return (
    <div className={classes.field}>
      <Input.Label id={labelId} onClick={() => view.current?.focus()}>
        {label}
      </Input.Label>
      <div
        ref={host}
        className={classes.frame}
        style={{ height: `calc(${String(rows)} * 1.5 * 13px + 10px)` }}
      />
    </div>
  );
}

function readOnlyExtension(readOnly: boolean): Extension {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.contentAttributes.of({ 'aria-readonly': String(readOnly) }),
  ];
}
