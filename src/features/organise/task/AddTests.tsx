import { useId, useState } from 'react';
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
import { namingSentences, pairedRefusal, waysOf } from './add-words';
import {
  matchFiles,
  NAME,
  namingOf,
  type MatchedTest,
  type PartNaming,
  type Source,
} from './match';
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

/** A number of things, with the word for one or for many. */
function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** How files dropped by name are named for the task's parts, under the drop box. */
function Naming({ parts }: { parts: PartNaming[] }) {
  return (
    <div className={classes.naming} aria-label="How to name the files">
      {namingSentences(parts).map((line) => (
        <BodyText key={line} tone="secondary">
          {line}
        </BodyText>
      ))}
    </div>
  );
}

/**
 * What the files make, a row per test and a column per part, so a missing
 * file stands out: each part's file and size, or Missing; then where the
 * test goes and what else stops it.
 */
function Preview({
  tests,
  parts,
}: {
  tests: (MatchedTest & { group: string; replaces: boolean; newGroup: boolean })[];
  parts: PartNaming[];
}) {
  const missing = (part: string) => `It has no ${part}.`;
  return (
    <table className={classes.preview} aria-label="Tests the files make">
      <thead>
        <tr>
          <th scope="col">Test</th>
          {parts.map((part) => (
            <th key={part.name} scope="col">
              {part.name}
            </th>
          ))}
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {tests.map((test) => {
          const notes = [
            ...(test.newGroup && test.group !== '' ? ['In a new group.'] : []),
            ...(test.replaces ? ['Replaces the test there.'] : []),
            ...test.problems.filter(
              (problem) => !parts.some((part) => problem === missing(part.name)),
            ),
          ];
          return (
            <tr key={`${test.group}/${test.test}`}>
              <th scope="row">
                {test.group}, test {test.test}
              </th>
              {parts.map((part) => {
                const files = test.files.filter((file) => file.field === part.name);
                if (files.length === 0) {
                  return (
                    <td key={part.name} className={classes.missing}>
                      Missing
                    </td>
                  );
                }
                const size = files.reduce((sum, file) => sum + file.source.size, 0);
                return (
                  <td key={part.name}>
                    {part.folder
                      ? `${count(files.length, 'file', 'files')}, ${formatSize(size)}`
                      : `${files[0]?.source.path.split('/').pop() ?? ''}, ${formatSize(size)}`}
                  </td>
                );
              })}
              <td>
                {notes.length > 0 ? (
                  <strong>{notes.join(' ')}</strong>
                ) : test.problems.length > 0 ? (
                  <strong>A part is missing.</strong>
                ) : (
                  'Complete'
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
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
  const whyNot = useId();
  const parts = namingOf(fields);
  const ways = waysOf(parts);
  const pairedNo = pairedRefusal(parts);

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
            `Could not be read: ${unread.map((entry) => `${entry.path}: ${entry.problem ?? ''}`).join(' ')}`,
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
        ? 'Give the new test group a name.'
        : !NAME.test(target)
          ? 'A test group’s name may hold only letters, digits, _ and -.'
          : groups.some((each) => each.name === target)
            ? 'There is already a test group with this name.'
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
  const left = placed.length - whole.length;
  /** What the button adds, said beside it once it can. */
  const addsLine =
    mode === 'one'
      ? null
      : left === 0
        ? `Adds ${count(whole.length, 'test', 'tests')}.`
        : `Adds ${count(whole.length, 'test', 'tests')}; ${count(left, 'test that is not complete is', 'tests that are not complete are')} left out.`;
  /** Why the button is greyed, said beside it. */
  const notReady =
    intoNew && groupProblem !== null
      ? groupProblem
      : mode === 'one'
        ? (placed[0]?.problems ?? []).some((problem) =>
            problem.startsWith('It has no '),
          )
          ? `${ways.one.replace(/\.$/, '')} first.`
          : (placed[0]?.problems.join(' ') ?? '')
        : placed.length === 0
          ? 'No files dropped yet.'
          : 'No test is complete yet: the table says what each one is missing.';

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
                  'It then shows under Test groups, where you set how it earns points.'
                }
              />
            )}
          </div>
        )}
        {!replacing && (
          <RadioGroup
            label="How do you want to add tests?"
            value={mode}
            options={[
              { value: 'one', label: 'One test', description: ways.one },
              {
                value: 'paired',
                label: 'Many files at once',
                description: ways.paired,
                disabled: pairedNo !== null,
                reason: pairedNo,
              },
              { value: 'zip', label: 'A zip', description: ways.zip },
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
          <>
            <FileDrop label="Test files" multiple files={files} onChange={setFiles} />
            <Naming parts={parts} />
          </>
        )}
        {mode === 'zip' && (
          <>
            <FileDrop
              label="Zip of tests"
              description="A folder per test group holds its tests, such as small/1/input; files at the top go into the group chosen above."
              accept=".zip,application/zip"
              files={zip === null ? [] : [zip]}
              onChange={(next) => chooseZip(next[0] ?? null)}
            />
            <Naming parts={parts} />
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

        {mode !== 'one' && (
          <section aria-label="What the files make" className={classes.matched}>
            {placed.length === 0 && unmatched.length === 0 ? (
              <BodyText tone="secondary">
                {mode === 'zip' && zip !== null && zipped?.length === 0
                  ? 'The zip holds no files.'
                  : 'Drop files above to see the tests they make.'}
              </BodyText>
            ) : (
              <Preview tests={placed} parts={parts} />
            )}
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
          <Button
            disabled={!ready}
            loading={reading}
            onClick={() => void add()}
            aria-describedby={whyNot}
          >
            {replacing ? 'Replace it' : mode === 'one' ? 'Add the test' : 'Add tests'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <span id={whyNot} className={classes.why}>
            {ready ? addsLine : notReady}
          </span>
        </div>
        <BodyText tone="secondary">
          Nothing is saved yet: the tests are added to the changes you save below.
        </BodyText>
      </div>
    </Modal>
  );
}
