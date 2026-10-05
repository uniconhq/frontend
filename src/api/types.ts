import type { components } from './schema';

/** The backend's schemas under the names the app uses for them. */
type Schemas = components['schemas'];

export type Me = Schemas['Me'];
export type ScopeNames = Schemas['ScopeNames'];
export type SessionInfo = Schemas['SessionInfo'];

/** An org, a contest or a task by its name. */
export type Named = Schemas['Named'];
export type TaskState = Schemas['TaskState'];
export type Publication = Schemas['Publication'];
export type DefinitionError = Schemas['DefinitionError'];
export type TreeEntry = Schemas['TreeEntry'];
export type FileContent = Schemas['FileContent'];
export type WriteFile = Schemas['WriteFile'];
/** A task save's answer: published, or kept as a draft. */
export type SaveResult = Schemas['Published'] | Schemas['Draft'];

export type TaskRelease = Schemas['TaskRelease'];
export type MyRegistration = Schemas['MyRegistration'];
export type Contestant = Schemas['Contestant'];
export type Holder = Schemas['Holder'];
export type RoleName = Holder['role'];
export type ContestSummary = Schemas['ContestSummary'];
export type ContestHome = Schemas['ContestHome'];
export type Limits = Schemas['Limits'];
export type PublicTask = Schemas['PublicTask'];
export type TaskPage = Schemas['TaskPage'];
export type ContestantInput = Schemas['ContestantInput'];

export type Upload = Schemas['Upload'];
export type SubmittedInput = Schemas['SubmittedInput'];
export type Submission = Schemas['Submission'];
export type GradingResult = Schemas['Result'];
export type Grading = Schemas['Grading'];
export type Announcement = Schemas['Announcement'];
export type Clarification = Schemas['Clarification'];
export type GradingStatus = GradingResult['status'];

/** The runner's list of outcomes, which a run and each of its tests take one of. */
export type Outcome = Schemas['GradedTest']['outcome'];
