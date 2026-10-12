import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { Modal } from '@/ui/Modal';
import { PageLink } from '@/ui/PageLink';
import { RadioGroup } from '@/ui/RadioGroup';
import { TextInput } from '@/ui/TextInput';
import { useMe } from '@/session';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, contestSectionPath, sectionOf } from '@/lib/sections';
import { readContest, writeContest, type ContestValues } from '../forms/contest-values';
import type { FormProps } from '../forms/DefinitionFile';
import { Fieldset, NumberField, TimeField } from '../forms/fields';
import {
  approvesAtOnce,
  DEFAULT_WAYS,
  newSignup,
  registrationSentence,
  wayProblems,
  type WayValues,
} from '../forms/ways';
import { numberProblem } from '../forms/yaml-doc';
import { InvitesSection } from '../invites/InvitesSection';
import { holdsAtContest } from '../roles';
import { SectionPage } from '../SectionPage';
import { ContestFile, FieldBox } from './ContestFile';
import { useOpenedField } from './opened';
import { viewFilePath } from './places';
import shared from '../organise.module.css';
import forms from '../forms/forms.module.css';
import classes from './contest.module.css';

type Signup = Extract<WayValues, { kind: 'signup' }>;

/** The conditions ticked on a sign-up, which an empty field does not untick. */
type Ticks = { code: boolean; domains: boolean };

function ticksOf(way: WayValues): Ticks {
  return way.kind === 'signup'
    ? { code: way.code !== '', domains: way.domains !== '' || way.emailPattern !== '' }
    : { code: false, domains: false };
}

/** The first way a new contest starts from, by what its organiser picks. */
const STARTERS: { label: string; says: string; ways: WayValues[] }[] = [
  {
    label: 'Anyone can sign up',
    says: 'Anyone with an account registers themselves.',
    ways: [newSignup()],
  },
  {
    label: 'Invite only',
    says: 'Only the people you invite can register.',
    ways: [{ kind: 'invite', approval: '' }],
  },
  {
    label: 'With a code',
    says: 'People register with a code you give them.',
    ways: [newSignup({ code: '' })],
  },
  {
    label: 'Students at a domain',
    says: 'People with an email address at your domain, approved straight away.',
    ways: [newSignup({ name: 'Students', approval: 'auto' })],
  },
];

const APPROVAL = [
  { value: 'auto', label: 'Approved straight away' },
  { value: 'manual', label: 'An organiser approves each one' },
];

/** What is wrong with the ways as typed, a ticked condition left empty among it. */
function problemsOf(ways: WayValues[], ticks: Ticks[]): string[] {
  const empty = ways.flatMap((way, at) => {
    if (way.kind !== 'signup') return [];
    const tick = ticks[at] ?? ticksOf(way);
    return [
      ...(tick.code && way.code.trim() === ''
        ? [`Way in ${String(at + 1)}: enter its code, or untick “Needs a code”.`]
        : []),
      ...(tick.domains && way.domains.trim() === '' && way.emailPattern.trim() === ''
        ? [
            `Way in ${String(at + 1)}: enter at least one domain, or untick “Only email addresses at these domains”.`,
          ]
        : []),
    ];
  });
  return [...wayProblems(ways), ...empty];
}

/**
 * One way in, as a card of its own: who it lets in and whether an organiser
 * approves them. Invites list and make the contest's invites right in the
 * card, once the way is saved; a sign-up ticks what it asks for, any of a
 * code and email domains, a regular expression under Advanced.
 */
function WayCard({
  way,
  index,
  ticks,
  saved,
  disabled,
  org,
  contest,
  manages,
  onChange,
  onTicks,
  onRemove,
}: {
  way: WayValues;
  index: number;
  ticks: Ticks;
  saved: boolean;
  disabled: boolean;
  org: string;
  contest: string;
  manages: boolean;
  onChange: (way: WayValues) => void;
  onTicks: (ticks: Ticks) => void;
  onRemove: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const title =
    way.kind === 'invite'
      ? 'People you invite'
      : way.name.trim() === ''
        ? 'Sign-up'
        : `Sign-up: ${way.name.trim()}`;
  const signup = (change: Partial<Signup>) => {
    if (way.kind === 'signup') onChange({ ...way, ...change });
  };

  return (
    <li data-item={index}>
      <FieldBox name="way">
        <Fieldset legend={title}>
          <FieldBox name="approval">
            <RadioGroup
              label="Approval"
              value={approvesAtOnce(way) ? 'auto' : 'manual'}
              options={APPROVAL}
              onChange={(approval) => onChange({ ...way, approval })}
              disabled={disabled}
            />
          </FieldBox>
          {way.kind === 'invite' ? (
            saved ? (
              <InvitesSection
                place={{ kind: 'contest', org, contest }}
                audience="contestants"
                manages={manages}
                administers={false}
              />
            ) : (
              <BodyText tone="secondary">
                Save first, then invite people by username or email address here.
              </BodyText>
            )
          ) : (
            <>
              <BodyText tone="secondary">
                People register themselves. With nothing ticked below, anyone with an
                account can.
              </BodyText>
              <FieldBox name="name">
                <TextInput
                  label="Name"
                  description="Shown beside everyone who came in this way, on the Entrants page."
                  placeholder="Such as NUS students"
                  value={way.name}
                  onChange={(name) => signup({ name })}
                  disabled={disabled}
                />
              </FieldBox>
              <FieldBox name="code">
                <Checkbox
                  label="Needs a code"
                  checked={ticks.code}
                  onChange={(code) => {
                    onTicks({ ...ticks, code });
                    if (!code) signup({ code: '' });
                  }}
                  disabled={disabled}
                />
                {ticks.code && (
                  <TextInput
                    label="Code"
                    description="People type it to register. Give it to those it is for."
                    value={way.kind === 'signup' ? way.code : ''}
                    onChange={(code) => signup({ code })}
                    disabled={disabled}
                  />
                )}
              </FieldBox>
              <FieldBox name="domains">
                <Checkbox
                  label="Only email addresses at these domains"
                  checked={ticks.domains}
                  onChange={(domains) => {
                    onTicks({ ...ticks, domains });
                    if (!domains) signup({ domains: '', emailPattern: '' });
                  }}
                  disabled={disabled}
                />
                {ticks.domains && way.kind === 'signup' && (
                  <>
                    <TextInput
                      label="Email domains"
                      description="Separate them with commas. Only confirmed addresses count, and each domain matches exactly: u.nus.edu does not let in comp.u.nus.edu."
                      placeholder="u.nus.edu"
                      value={way.domains}
                      onChange={(domains) => signup({ domains })}
                      disabled={disabled}
                    />
                    <details className={classes.advanced}>
                      <summary>Advanced</summary>
                      <FieldBox name="email_pattern">
                        <TextInput
                          label="Email pattern"
                          description="A regular expression a confirmed address must match, ignoring case, as well as the domains."
                          value={way.emailPattern}
                          onChange={(emailPattern) => signup({ emailPattern })}
                          disabled={disabled}
                        />
                      </FieldBox>
                    </details>
                  </>
                )}
              </FieldBox>
            </>
          )}
          {!disabled && (
            <div className={shared.actions}>
              <Button
                size="xs"
                variant="danger"
                label={`Remove ${title}`}
                onClick={() => setAsking(true)}
              >
                Remove this way
              </Button>
            </div>
          )}
          <Modal
            opened={asking}
            onClose={() => setAsking(false)}
            title={`Remove ${title}?`}
          >
            <div className={shared.stack}>
              <BodyText>
                Nobody new comes in this way once it is saved. Those already in stay.
              </BodyText>
              <div className={shared.actions}>
                <Button
                  variant="danger"
                  onClick={() => {
                    setAsking(false);
                    onRemove();
                  }}
                >
                  Remove
                </Button>
                <Button variant="secondary" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Modal>
        </Fieldset>
      </FieldBox>
    </li>
  );
}

/**
 * How people enter, as a form: the ways in, each a card, any one enough;
 * when registration opens and closes; how many may register; and the
 * sentence it all adds up to, live. A contest that has no ways written
 * starts from a choice of four. A sign-up on a contest only its entrants
 * see is warned of, since nobody can find it to sign up.
 */
function EntryForm({
  doc,
  busy,
  onSave,
  admin,
  org,
  contest,
  manages,
}: FormProps & { admin: boolean; org: string; contest: string; manages: boolean }) {
  const [read] = useState(() => readContest(doc));
  const [values, setValues] = useState<ContestValues>(read.values);
  const [ticks, setTicks] = useState<Ticks[]>(() =>
    (read.values.ways ?? []).map(ticksOf),
  );
  const [opensAt, setOpensAt] = useState(read.values.opens !== '');
  const [closesAt, setClosesAt] = useState(read.values.closes !== '');
  useOpenedField(true);
  const set = <K extends keyof ContestValues>(key: K, value: ContestValues[K]) =>
    setValues((before) => ({ ...before, [key]: value }));
  const locked = !admin;
  const unreadable =
    read.unreadable.includes('registration') || read.unreadable.includes('ways');
  const ways = values.ways;
  const changed = JSON.stringify(values) !== JSON.stringify(read.values);
  const problems = [
    numberProblem(values.capacity, true),
    ...(ways === null ? [] : problemsOf(ways, ticks)),
  ].filter((problem) => problem !== undefined);
  const savedInvite = (read.values.ways ?? []).some((way) => way.kind === 'invite');
  const signups = (ways ?? DEFAULT_WAYS).some((way) => way.kind === 'signup');

  const setWays = (next: WayValues[], nextTicks: Ticks[]) => {
    set('ways', next);
    setTicks(nextTicks);
  };
  const raw = (path: string) => read.rawTimes[path];

  if (unreadable) {
    return (
      <BodyText>
        How people enter cannot be read here. Ask a platform admin to fix the contest’s
        settings.
      </BodyText>
    );
  }

  return (
    <div className={forms.form} role="group" aria-label="How people enter">
      <div className={shared.panel} role="status" aria-label="What it adds up to">
        <BodyText>{registrationSentence(values)}</BodyText>
      </div>
      {signups && values.visibility === 'hidden' && (
        <div className={shared.panel} role="note">
          <BodyText>
            Only its entrants and organisers see this contest, so nobody can find it to
            sign up: only the people you invite can register. Let anyone signed in see
            it from the contest’s status, or invite people instead.
          </BodyText>
        </div>
      )}
      {locked && (
        <BodyText tone="secondary">
          Only an admin of the contest can change these.
        </BodyText>
      )}

      <Fieldset
        legend="Ways in"
        note="People can register through any one of these ways, as long as they meet everything that way asks."
      >
        {ways === null ? (
          <div className={shared.stack}>
            <BodyText>
              Until you choose, anyone with an account can sign up, and an organiser
              approves each one. Start from one of these, then change it or add more:
            </BodyText>
            <div className={classes.starters} role="group" aria-label="Start from">
              {STARTERS.map((starter) => (
                <div key={starter.label} className={classes.starter}>
                  <Button
                    variant="secondary"
                    disabled={locked}
                    onClick={() =>
                      setWays(
                        starter.ways,
                        starter.ways.map((way) =>
                          starter.label === 'With a code'
                            ? { code: true, domains: false }
                            : starter.label === 'Students at a domain'
                              ? { code: false, domains: true }
                              : ticksOf(way),
                        ),
                      )
                    }
                  >
                    {starter.label}
                  </Button>
                  <BodyText tone="secondary">{starter.says}</BodyText>
                </div>
              ))}
            </div>
          </div>
        ) : ways.length === 0 ? (
          <div className={shared.panel} role="alert">
            <BodyText>
              Nobody can register: the contest has no way in. Add one.
            </BodyText>
          </div>
        ) : (
          <ol className={forms.entries} aria-label="Ways in">
            {ways.map((way, index) => (
              <WayCard
                key={index}
                way={way}
                index={index}
                ticks={ticks[index] ?? ticksOf(way)}
                saved={savedInvite}
                disabled={locked}
                org={org}
                contest={contest}
                manages={manages}
                onChange={(next) =>
                  set(
                    'ways',
                    ways.map((old, at) => (at === index ? next : old)),
                  )
                }
                onTicks={(next) =>
                  setTicks(
                    ways.map((old, at) =>
                      at === index ? next : (ticks[at] ?? ticksOf(old)),
                    ),
                  )
                }
                onRemove={() =>
                  setWays(
                    ways.filter((_, at) => at !== index),
                    ways
                      .map((old, at) => ticks[at] ?? ticksOf(old))
                      .filter((_, at) => at !== index),
                  )
                }
              />
            ))}
          </ol>
        )}
        {ways !== null && !locked && (
          <div className={shared.actions}>
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                setWays(
                  [...ways, newSignup()],
                  [
                    ...ways.map((old, at) => ticks[at] ?? ticksOf(old)),
                    { code: false, domains: false },
                  ],
                )
              }
            >
              Add a sign-up
            </Button>
            {!ways.some((way) => way.kind === 'invite') && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  setWays(
                    [...ways, { kind: 'invite', approval: '' }],
                    [
                      ...ways.map((old, at) => ticks[at] ?? ticksOf(old)),
                      { code: false, domains: false },
                    ],
                  )
                }
              >
                Add invites
              </Button>
            )}
          </div>
        )}
      </Fieldset>

      <Fieldset
        legend="When"
        note="Registration is only ever open while the contest is open and before it ends."
      >
        <FieldBox name="opens">
          <RadioGroup
            label="Registration opens"
            value={opensAt ? 'at' : 'open'}
            options={[
              { value: 'open', label: 'When the contest is opened' },
              { value: 'at', label: 'At a time' },
            ]}
            onChange={(choice) => {
              setOpensAt(choice === 'at');
              if (choice !== 'at') set('opens', '');
            }}
            disabled={locked}
          />
          {opensAt && (
            <TimeField
              label="Opens at"
              value={values.opens}
              raw={raw('registration.opens')}
              onChange={(opens) => set('opens', opens)}
              disabled={locked}
            />
          )}
        </FieldBox>
        <FieldBox name="closes">
          <RadioGroup
            label="Registration closes"
            value={closesAt ? 'at' : 'end'}
            options={[
              { value: 'end', label: 'When the contest ends' },
              { value: 'at', label: 'At a time' },
            ]}
            onChange={(choice) => {
              setClosesAt(choice === 'at');
              if (choice === 'at' && values.closes === '') set('closes', values.start);
              if (choice !== 'at') set('closes', '');
            }}
            disabled={locked}
          />
          {closesAt && (
            <TimeField
              label="Closes at"
              value={values.closes}
              raw={raw('registration.closes')}
              onChange={(closes) => set('closes', closes)}
              hint="Starts at the contest’s start. Closing registration then keeps late entrants out."
              disabled={locked}
            />
          )}
        </FieldBox>
      </Fieldset>

      <Fieldset legend="Limit">
        <FieldBox name="capacity">
          <NumberField
            label="Most entrants"
            value={values.capacity}
            onChange={(capacity) => set('capacity', capacity)}
            placeholder="No limit"
            hint="Entrants waiting for approval count towards it."
            whole
            disabled={locked}
          />
        </FieldBox>
      </Fieldset>

      {problems.length > 0 && (
        <ul className={shared.named} aria-label="To fix before saving">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <div className={shared.actions}>
        <Button
          loading={busy}
          disabled={locked || !changed || problems.length > 0}
          onClick={() =>
            onSave((fresh) => writeContest(fresh, read.values, values, { admin }))
          }
        >
          Save how people enter
        </Button>
        {changed && <UnsavedNote />}
      </div>
    </div>
  );
}

/** How people enter the contest, with the link to who has. */
export function ContestEntryPage() {
  const { org, contest } = useContestParams();
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  return (
    <SectionPage
      section={sectionOf(CONTEST_SECTIONS, 'entry')}
      links={
        <>
          <PageLink to={contestSectionPath(org, contest, 'entrants')}>
            Entrants
          </PageLink>
          <PageLink to={viewFilePath(org, contest)}>View file</PageLink>
        </>
      }
    >
      <Card>
        <ContestFile org={org} contest={contest}>
          {(props) => (
            <EntryForm {...props} org={org} contest={contest} manages={manages} />
          )}
        </ContestFile>
      </Card>
    </SectionPage>
  );
}
