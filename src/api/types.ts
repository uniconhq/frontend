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
export type RollbackFile = Schemas['RollbackFile'];
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
export type TaskEntry = Schemas['TaskEntry'];

export type Upload = Schemas['Upload'];
export type SubmittedInput = Schemas['SubmittedInput'];
export type Submission = Schemas['Submission'];
export type GradingResult = Schemas['Result'];
export type GroupShown = Schemas['GroupShown'];
export type Grading = Schemas['Grading'];
export type Rejudged = Schemas['Rejudged'];
/** One attempt in a contest's gradings feed, with its task and who submitted. */
export type FeedEntry = Schemas['FeedEntry'];
export type Submitter = Schemas['Submitter'];
export type QueueDepth = Schemas['QueueDepth'];
export type Announcement = Schemas['Announcement'];
export type Clarification = Schemas['Clarification'];
export type GradingStatus = GradingResult['status'];

/** The runner's list of outcomes, which each test and what stopped a run take one of. */
export type Outcome = Schemas['GradedTest']['outcome'];
