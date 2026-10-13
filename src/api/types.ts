import type { components } from './schema';

/** The backend's schemas under the names the app uses for them. */
type Schemas = components['schemas'];

export type Me = Schemas['Me'];
export type ScopeNames = Schemas['ScopeNames'];
export type SessionInfo = Schemas['SessionInfo'];

/** An org, a contest or a task by its name. */
export type Named = Schemas['Named'];
export type TaskState = Schemas['TaskState'];
/** A task of a contest with its letter, its state and its timeline. */
export type TaskStanding = Schemas['TaskStanding'];
/** What taking a task out of its contest does: remove it, or withdraw it. */
export type TakeOut = Schemas['TakeOut'];
export type Publication = Schemas['Publication'];
export type DefinitionError = Schemas['DefinitionError'];
export type TreeEntry = Schemas['TreeEntry'];
export type FileContent = Schemas['FileContent'];
export type WriteFile = Schemas['WriteFile'];
/** One file a task's save writes or removes. */
export type SaveChange = Schemas['FileChange'];
/** What a file that is an upload holds: its size and SHA-256. */
export type UploadInfo = Schemas['UploadInfo'];
export type RollbackFile = Schemas['RollbackFile'];
/** A save of several of a task's files at once, in one commit. */
export type SaveRequest = Schemas['SaveRequest'];
/** A task save's answer: published, or kept as a draft. */
export type SaveResult = Schemas['Published'] | Schemas['Draft'];
/**
 * What a save does, in words: whether anyone's result changes, and what runs
 * again, the scores and what entrants read. A running contest asks with it
 * before a save publishes, and a published save answers with it.
 */
export type SaveEffect = Schemas['SaveEffect'];

export type TaskRelease = Schemas['TaskRelease'];
/**
 * The caller's part in a contest: their entrant, if any, their invites into
 * other entrants, whether and how they may register, and the contest's sizes.
 */
export type MyEntry = Schemas['MyEntry'];
/** One or more people who enter a contest together, as its members read it. */
export type Entrant = Schemas['Entrant'];
export type EntrantMember = Schemas['Member'];
/** An entrant as its contest's organisers read it, its members with their email. */
export type OrganisedEntrant = Schemas['OrganisedEntrant'];
export type OrganisedMember = Schemas['OrganisedMember'];
/** One of the caller's own invites into an entrant of the contest. */
export type Invitation = Schemas['Invitation'];
export type EntrantStatus = Entrant['status'];
export type Holder = Schemas['Holder'];
export type RoleName = Holder['role'];
export type Invite = Schemas['Invite'];
/**
 * What an invite gives once accepted: a place in a contest, a member's place
 * in an entrant, or a role.
 */
export type Grant = Invite['grants'];
/** What an organiser's invite may give: a role, or a place in a contest. */
export type OfferedGrant = Schemas['InviteRequest']['grants'];
/** What accepting an invite did: the invite, and the entrant it put the person in. */
export type AcceptedInvite = Schemas['AcceptedInvite'];
export type Entered = Schemas['Entered'];
export type ContestSummary = Schemas['ContestSummary'];
/** A contest in its org's list, with its state and dates as its settings say. */
export type ListedContest = Schemas['ListedContest'];

export type ContestHome = Schemas['ContestHome'];
export type PublicTask = Schemas['PublicTask'];
export type TaskPage = Schemas['TaskPage'];
export type InputField = Schemas['InputField'];
/** What the task form is built from: the inputs and test fields its workflow declares. */
export type WorkflowForm = Schemas['WorkflowForm'];
export type DeclaredInput = Schemas['DeclaredInput'];
export type DeclaredField = Schemas['DeclaredField'];
export type TaskEntry = Schemas['TaskEntry'];
/** An entrant's points on a task as one leaderboard counts them. */
export type BoardPoints = Schemas['BoardPoints'];

export type Upload = Schemas['Upload'];
export type SubmittedInput = Schemas['SubmittedInput'];
export type Submission = Schemas['Submission'];
export type GradingResult = Schemas['Result'];
/** What a result holds beside where it stands, the contestant's and the organisers' alike. */
export type ScoredGrading = Omit<GradingResult, 'status'>;
/** A row's submission as organisers read it, with everything filled in. */
export type OrganisedSubmission = Schemas['OrganisedSubmission'];
export type GroupShown = Schemas['GroupShown'];
/** A run's reported values by name, its numbers exact and its texts apart. */
export type Reported = Schemas['Reported'];
/**
 * One value a task's workflow reports, as pages name it: its key, its title
 * and unit, and how it folds over the tests and which way is better.
 */
export type ValueMeaning = Schemas['ValueMeaning'];
/** One test's row of a result, with its credit once scored. */
export type GradedTest = Schemas['GradedTest'];
export type Grading = Schemas['Grading'];
export type Rejudged = Schemas['Rejudged'];
/** A task's latest regrade of many, summed up by what it did to each submission. */
export type RegradeSummary = Schemas['RegradeSummary'];
/** One result a regrade compares: the one it replaced, or its own. */
export type RegradeSide = Schemas['RegradeSide'];
/** What a regrade did to one submission: up, down, now stopped, and so on. */
export type RegradeChangeKind = Schemas['ChangeKind'];
/** What a regrade did to one submission, with the result it replaced and its own. */
export type RegradeChange = Schemas['RegradeChange'];
/** One attempt in a contest's gradings feed, with its task and who submitted. */
export type FeedEntry = Schemas['FeedEntry'];
export type Submitter = Schemas['Submitter'];
export type QueueDepth = Schemas['QueueDepth'];
export type Announcement = Schemas['Announcement'];
/** The announcement a public answer posted, which its message on the question names. */
export type AnnouncementLink = Schemas['AnnouncementLink'];
/** One change in a place's history, its author named. */
export type FileChange = Schemas['Change'];
export type Clarification = Schemas['Clarification'];
/** Where a grading stands, as organisers read it. */
export type GradingStatus = Schemas['GradingStatus'];
/** Where a submission stands, as its contestant is told. */
export type SubmissionState = GradingResult['status'];
/** A board as its reader sees it now, or the time it is shown from. */
export type Board = Schemas['Board'];
export type BoardKey = Schemas['BoardKey'];
export type BoardCell = Schemas['BoardCell'];
export type BoardRow = Schemas['BoardRow'];
/** A board as organisers read it: `now`, `final` and what it asks that does not hold. */
export type OrganisedBoard = Schemas['OrganisedBoard'];
/** The marks a row holds on a task, the most it may hold, and its close. */
export type Marks = Schemas['Marks'];

/** The runner's list of outcomes, which each test and what stopped a run take one of. */
export type Outcome = Schemas['GradedTest']['outcome'];

/** A primitive at one version, with its declared ports. */
export type Primitive = Schemas['Primitive'];
export type PrimitivePort = Schemas['PrimitivePort'];
/** A workflow a person may read, and whether they may edit it. */
export type WorkflowItem = Schemas['WorkflowItem'];
/** A workflow as its page shows it, with the draft for one who may edit it. */
export type WorkflowPage = Schemas['WorkflowPage'];
/** One problem a version would be refused for, at its YAML path. */
export type DefinitionProblem = Schemas['DefinitionProblem'];
export type Visibility = Schemas['Visibility'];
