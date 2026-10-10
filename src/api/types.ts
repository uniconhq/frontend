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
export type Publication = Schemas['Publication'];
export type DefinitionError = Schemas['DefinitionError'];
export type TreeEntry = Schemas['TreeEntry'];
export type FileContent = Schemas['FileContent'];
export type WriteFile = Schemas['WriteFile'];
/** What a file that is an upload holds: its size and SHA-256. */
export type UploadInfo = Schemas['UploadInfo'];
export type RollbackFile = Schemas['RollbackFile'];
/** A save of several of a task's files at once, in one commit. */
export type SaveRequest = Schemas['SaveRequest'];
/** A task save's answer: published, or kept as a draft. */
export type SaveResult = Schemas['Published'] | Schemas['Draft'];

export type TaskRelease = Schemas['TaskRelease'];
export type MyRegistration = Schemas['MyRegistration'];
export type Contestant = Schemas['Contestant'];
export type Holder = Schemas['Holder'];
export type RoleName = Holder['role'];
export type Invite = Schemas['Invite'];
/** What an invite gives once accepted: a contestant's place, or a role. */
export type Grant = Invite['grants'];
export type Team = Schemas['Team'];
export type TeamMember = Schemas['Member'];
export type ListedTeam = Schemas['ListedTeam'];
export type MyTeams = Schemas['MyTeams'];
export type ContestSummary = Schemas['ContestSummary'];
export type ContestHome = Schemas['ContestHome'];
export type PublicTask = Schemas['PublicTask'];
export type TaskPage = Schemas['TaskPage'];
export type InputField = Schemas['InputField'];
/** What the task form is built from: the inputs and test fields its workflow declares. */
export type WorkflowForm = Schemas['WorkflowForm'];
export type DeclaredInput = Schemas['DeclaredInput'];
export type DeclaredField = Schemas['DeclaredField'];
export type TaskEntry = Schemas['TaskEntry'];

export type Upload = Schemas['Upload'];
export type SubmittedInput = Schemas['SubmittedInput'];
export type Submission = Schemas['Submission'];
export type GradingResult = Schemas['Result'];
export type GroupShown = Schemas['GroupShown'];
/** A run's reported values by name, its numbers exact and its texts apart. */
export type Reported = Schemas['Reported'];
/** One test's row of a result, with its credit once scored. */
export type GradedTest = Schemas['GradedTest'];
export type Grading = Schemas['Grading'];
/** Who has a broken attempt count as its submission's last good result. */
export type Fallback = NonNullable<Grading['fallback']>;
export type Rejudged = Schemas['Rejudged'];
/** One attempt in a contest's gradings feed, with its task and who submitted. */
export type FeedEntry = Schemas['FeedEntry'];
export type Submitter = Schemas['Submitter'];
export type QueueDepth = Schemas['QueueDepth'];
export type Announcement = Schemas['Announcement'];
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
