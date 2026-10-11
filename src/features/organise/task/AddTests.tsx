import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toApiError, type ApiError } from '@/api/problem';
import type { DeclaredField } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { Modal } from '@/ui/Modal';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { formatSize } from '@/lib/size';
import { fileQuery } from '../files/place';
import { NumberField } from '../forms/fields';
import { isRecord, parseYaml, textAt, valueAt } from '../forms/yaml-doc';
import type { TaskPlace } from './build-data';
import { matchFiles, NAME, type MatchedTest, type Source } from './match';
import { existingOf, testFolder, type StagedTest } from './staged';
import { readZip, ZipError } from './zip';
import shared from '../organise.module.css';
import classes from './task.module.css';

type Mode = 'one' | 'paired' | 'zip';

/** Where the dialog starts: a group to add to, or one test of it to replace. */
export type AddStart = { group: string | null; test: string | null };

const NEW_GROUP = '\u0000new';

/** A file from the disk as a source of a test's file. */
function fromFile(file: File, path = file.name): Source {
  return { path, size: file.size, read: () => Promise.resolve(file) };
}

/** The next test's name in a group: one after its highest number, or 1. */
function nextName(taken: string[]): string {
  const numbers = taken.map(Number).filter((value) => Number.isInteger(value));
  return String(Math.max(0, ...numbers) + 1);
}

/** The fields a test is given values for, in its `test.yaml`. */
function valueFieldsOf(fields: DeclaredField[]): DeclaredField[] {
  return fields.filter((field) => field.type !== 'file' && field.type !== 'folder');
}

/** A field for a test's value, as its type takes it. */
function ValueBox({
  field,
  value,
  onChange,
}: {
  field: DeclaredField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === 'number') {
    return <NumberField label={field.name} value={value} onChange={onChange} />;
  }
  if (field.type === 'boolean' || field.type === 'enum') {
    const options =
      field.type === 'boolean'
        ? [
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ]
        : (field.options ?? []).map((option) => ({ value: option, label: option }));
    return (
      <Select
        label={field.name}
        value={value}
        options={options}
        placeholder="Not set"
        onChange={onChange}
      />
    );
  }
  return <TextInput label={field.name} value={value} onChange={onChange} />;
}

/** The values a test has now, read from its `test.yaml`, to start a replacement from. */
function useSavedValues(
  place: TaskPlace,
  start: AddStart,
  fields: DeclaredField[],
): Record<string, string> | null | 'loading' {
  const wanted = start.group !== null && start.test !== null && fields.length > 0;
  const path =
    start.group !== null && start.test !== null
      ? `${testFolder(start.group, start.test)}/test.yaml`
      : '';
  const read = useQuery({ ...fileQuery(place, path), enabled: wanted, retry: false });
  if (!wanted) return null;
  if (read.isPending) return 'loading';
  if (read.data === undefined || read.data.encoding !== 'utf-8') return null;
  const parsed = parseYaml(read.data.content);
  if ('error' in parsed || !isRecord(valueAt(parsed.doc, []))) return null;
  return Object.fromEntries(
    fields.map((field) => [field.name, textAt(parsed.doc, [field.name])]),
  );
}

/**
 * Adding tests to a group, or replacing one, for the one save of the task.
 * Pick the group, or make one by naming it, which then shows in Scoring;
 * then one test by its fields, or many at once from files named by test
 * (`1.in` with `1.out`) or a zip of folders, with what each file was matched
 * to, and what was not and why, shown before anything is added. A test that
 * is there already is replaced, which the list says. Nothing is saved here:
 * the tests join the save bar's changes.
 */
export function AddTests({
  place,
  fields,
  groups,
  start,
  onAdd,
  onClose,
}: {
  place: TaskPlace;
  /** The fields each test has, from the workflow. */
  fields: DeclaredField[];
  /** Each group's tests, saved or added, by its name. */
  groups: { name: string; tests: string[] }[];
  start: AddStart;
  onAdd: (tests: StagedTest[]) => void;
  onClose: () => void;
}) {
  const replacing = start.group !== null && start.test !== null;
  const [group, setGroup] = useState(start.group ?? groups[0]?.name ?? NEW_GROUP);
  const [newGroup, setNewGroup] = useState(groups.length === 0 ? 'main' : '');
  const [mode, setMode] = useState<Mode>('one');
  const target = group === NEW_GROUP ? newGroup.trim() : group;
  const taken = groups.find((each) => each.name === target)?.tests ?? [];
  const [testName, setTestName] = useState(start.test ?? nextName(taken));
  const [chosen, setChosen] = useState<Record<string, File[]>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [zip, setZip] = useState<File | null>(null);
  const [zipped, setZipped] = useState<Source[] | null>(null);
  const [zipProblem, setZipProblem] = useState<string | null>(null);
  const valueFields = valueFieldsOf(fields);
  const saved = useSavedValues(place, start, valueFields);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [refused, setRefused] = useState<ApiError | null>(null);

  // A replaced test's values start as it has them, once they are read.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && saved !== 'loading') {
    setSeeded(true);
    if (saved !== null) setValues(saved);
  }

  /** A zip chosen, read for its files; the last one chosen is the one shown. */
  const chooseZip = (next: File | null) => {
    setZip(next);
    setZipProblem(null);
    setZipped(next === null ? null : []);
    if (next === null) return;
    readZip(next)
      .then((entries) => {
        setZipped(
          entries
            .filter((entry) => entry.problem === null)
            .map((entry) => ({ path: entry.path, size: entry.size, read: entry.read })),
        );
        const unread = entries.filter((entry) => entry.problem !== null);
        if (unread.length > 0) {
          setZipProblem(
            `Not read: ${unread.map((entry) => `${entry.path}: ${entry.problem ?? ''}`).join(' ')}`,
          );
        }
      })
      .catch((error: unknown) => {
        setZipped([]);
        setZipProblem(
          error instanceof ZipError ? error.message : 'It could not be read as a zip.',
        );
      });
  };

  const groupProblem =
    group !== NEW_GROUP
      ? null
      : target === ''
        ? 'Name the new group.'
        : !NAME.test(target)
          ? 'A group’s name may hold only letters, digits, _ and -.'
          : groups.some((each) => each.name === target)
            ? 'There is a group with this name.'
            : null;

  // What the files make, each test in its group: the chosen one, unless a
  // zip's folders name another.
  const fileFields = fields.filter(
    (field) => field.type === 'file' || field.type === 'folder',
  );
  const many =
    mode === 'one'
      ? null
      : matchFiles(
          mode === 'zip' ? (zipped ?? []) : files.map((file) => fromFile(file)),
          fields,
        );
  const matched: MatchedTest[] =
    many === null
      ? [
          {
            group: null,
            test: testName.trim(),
            files: fileFields.flatMap((field) =>
              (chosen[field.name] ?? []).map((file) => ({
                field: field.name,
                entry:
                  field.type === 'folder'
                    ? `${field.name}/${file.webkitRelativePath === '' ? file.name : file.webkitRelativePath.split('/').slice(1).join('/')}`
                    : `${field.name}${/\.[^.]+$/.exec(file.name)?.[0] ?? ''}`,
                source: fromFile(file),
              })),
            ),
            problems: [
              ...(NAME.test(testName.trim())
                ? []
                : ['A test’s name may hold only letters, digits, _ and -.']),
              ...(replacing
                ? []
                : fileFields
                    .filter((field) => (chosen[field.name] ?? []).length === 0)
                    .map((field) => `It has no ${field.name}.`)),
            ],
          },
        ]
      : many.tests;
  const unmatched = many?.unmatched ?? [];
  const placed = matched.map((test) => {
    const into = test.group ?? target;
    const known = groups.find((each) => each.name === into);
    const hasYaml = test.files.some((file) => file.field === 'test.yaml');
    const missingValues =
      hasYaml || replacing
        ? []
        : valueFields.filter((field) => (values[field.name] ?? '').trim() === '');
    return {
      ...test,
      group: into,
      replaces: known?.tests.includes(test.test) ?? false,
      newGroup: known === undefined,
      problems: [
        ...test.problems,
        ...missingValues.map((field) => `It needs a value for ${field.name}.`),
      ],
    };
  });
  const whole = placed.filter((test) => test.problems.length === 0);
  // A new group must be named well when a test goes into it.
  const intoNew = group === NEW_GROUP && whole.some((test) => test.group === target);
  const ready = whole.length > 0 && !(intoNew && groupProblem !== null);

  const add = async () => {
    setReading(true);
    setRefused(null);
    try {
      const staged = await Promise.all(
        whole.map(async (test): Promise<StagedTest> => {
          const hasYaml = test.files.some((file) => file.field === 'test.yaml');
          const before = saved !== 'loading' && saved !== null ? saved : {};
          const unchanged = valueFields.every(
            (field) => (values[field.name] ?? '') === (before[field.name] ?? ''),
          );
          const given =
            valueFields.length === 0 || hasYaml || (replacing && unchanged)
              ? null
              : Object.fromEntries(
                  valueFields.map((field) => [field.name, values[field.name] ?? '']),
                );
          return {
            group: test.group,
            test: test.test,
            files: test.files,
            values: given,
            existing: test.replaces
              ? await existingOf(place, test.group, test.test)
              : [],
          };
        }),
      );
      onAdd(staged);
      onClose();
    } catch (error) {
      setRefused(toApiError(error));
    } finally {
      setReading(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        replacing
          ? `Replace test ${start.test ?? ''} of ${start.group ?? ''}`
          : 'Add tests'
      }
    >
      <div className={shared.stack}>
        {!replacing && (
          <div className={classes.grid}>
            <Select
              label="Test group"
              value={group}
              options={[
                ...groups.map((each) => ({ value: each.name, label: each.name })),
                { value: NEW_GROUP, label: 'A new group' },
              ]}
              onChange={(value) => {
                setGroup(value);
                const tests = groups.find((each) => each.name === value)?.tests ?? [];
                setTestName(nextName(tests));
              }}
            />
            {group === NEW_GROUP && (
              <TextInput
                label="Name of the new group"
                value={newGroup}
                onChange={setNewGroup}
                description={
                  groupProblem ??
                  'It then shows in Scoring, to set how it earns points.'
                }
              />
            )}
          </div>
        )}
        {!replacing && (
          <RadioGroup
            label="How"
            value={mode}
            options={[
              { value: 'one', label: 'One test' },
              { value: 'paired', label: 'Several, from files named by test' },
              { value: 'zip', label: 'From a zip' },
            ]}
            onChange={(value) =>
              setMode(value === 'paired' || value === 'zip' ? value : 'one')
            }
          />
        )}

        {mode === 'one' && (
          <>
            {!replacing && (
              <TextInput label="Test name" value={testName} onChange={setTestName} />
            )}
            {replacing && (
              <BodyText tone="secondary">
                Choose only what changes: a part left empty keeps the file the test has.
              </BodyText>
            )}
            {fileFields.map((field) => (
              <FileDrop
                key={field.name}
                label={field.name}
                folder={field.type === 'folder'}
                files={chosen[field.name] ?? []}
                onChange={(next) =>
                  setChosen((before) => ({ ...before, [field.name]: next }))
                }
                pathOf={(file) =>
                  file.webkitRelativePath === '' ? file.name : file.webkitRelativePath
                }
              />
            ))}
          </>
        )}
        {mode === 'paired' && (
          <FileDrop
            label="Test files"
            description={`Named by test, each ending saying which part it is, such as 1.in and 1.out.`}
            multiple
            files={files}
            onChange={setFiles}
          />
        )}
        {mode === 'zip' && (
          <>
            <FileDrop
              label="Zip of tests"
              description="Folders for groups and tests, such as small/1/input, or files named by test."
              accept=".zip,application/zip"
              files={zip === null ? [] : [zip]}
              onChange={(next) => chooseZip(next[0] ?? null)}
            />
            {zipProblem !== null && <BodyText tone="secondary">{zipProblem}</BodyText>}
          </>
        )}

        {valueFields.length > 0 && (
          <fieldset className={classes.item}>
            <legend className={classes.partTitle}>
              {mode === 'one' ? 'Its values' : 'Values for every test added'}
            </legend>
            {mode !== 'one' && (
              <BodyText tone="secondary">
                A test whose folder has its own test.yaml keeps the values in it.
              </BodyText>
            )}
            <div className={classes.grid}>
              {valueFields.map((field) => (
                <ValueBox
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? ''}
                  onChange={(value) =>
                    setValues((before) => ({ ...before, [field.name]: value }))
                  }
                />
              ))}
            </div>
          </fieldset>
        )}

        {(mode !== 'one' || placed.some((test) => test.files.length > 0)) && (
          <section aria-label="What was matched" className={classes.matched}>
            <BodyText>
              {placed.length === 0
                ? 'No test yet.'
                : `${String(placed.length)} ${placed.length === 1 ? 'test' : 'tests'}:`}
            </BodyText>
            <ul className={shared.named}>
              {placed.map((test) => (
                <li key={`${test.group}/${test.test}`}>
                  {test.group}, test {test.test}:{' '}
                  {test.files
                    .map((file) => `${file.entry} (${formatSize(file.source.size)})`)
                    .join(', ') || 'no new files'}
                  {test.newGroup && test.group !== '' ? ', in a new group' : ''}
                  {test.replaces ? '; replaces the test there' : ''}
                  {test.problems.length > 0 && (
                    <strong> {test.problems.join(' ')}</strong>
                  )}
                </li>
              ))}
            </ul>
            {unmatched.length > 0 && (
              <>
                <BodyText>Not matched to a test:</BodyText>
                <ul className={shared.named} aria-label="Not matched">
                  {unmatched.map((file) => (
                    <li key={file.path}>
                      {file.path}: {file.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        {refused !== null && <ErrorBlock error={refused} compact />}
        <div className={shared.actions}>
          <Button disabled={!ready} loading={reading} onClick={() => void add()}>
            {replacing
              ? 'Replace it'
              : whole.length === placed.length
                ? `Add ${whole.length === 1 ? 'the test' : `${String(whole.length)} tests`}`
                : `Add the ${String(whole.length)} whole ${whole.length === 1 ? 'test' : 'tests'}`}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <BodyText tone="secondary">
          Nothing is saved yet: the tests join the changes to save below.
        </BodyText>
      </div>
    </Modal>
  );
}
