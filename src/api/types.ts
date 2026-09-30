import type { components } from './schema';

/** The backend's schemas under the names the app uses for them. */
type Schemas = components['schemas'];

export type Me = Schemas['Me'];
export type Scope = Schemas['Scope'];
export type SessionInfo = Schemas['SessionInfo'];

export type Provisioning = Schemas['Provisioning'];
export type Contest = Schemas['Contest'];
export type Task = Schemas['Task'];
export type TaskState = Schemas['TaskState'];
export type Publication = Schemas['Publication'];
export type DefinitionError = Schemas['DefinitionError'];
export type TreeEntry = Schemas['TreeEntry'];
export type FileContent = Schemas['FileContent'];
export type WriteFile = Schemas['WriteFile'];
/** A task save's answer, told apart by `outcome`: published, or kept as a draft. */
export type SaveResult = Schemas['PublishedSave'] | Schemas['DraftSave'];

export type TaskRelease = Schemas['TaskRelease'];
export type MyRegistration = Schemas['MyRegistration'];
export type Contestant = Schemas['Contestant'];
export type ContestSummary = Schemas['ContestSummary'];
export type ContestHome = Schemas['ContestHome'];
export type Limits = Schemas['Limits'];
export type PublicTask = Schemas['PublicTask'];
export type TaskPage = Schemas['TaskPage'];
export type ContestantInput = Schemas['ContestantInput'];

export type UploadSlot = Schemas['PostUploadSlot'] | Schemas['MultipartUploadSlot'];
export type Upload = Schemas['Upload'];
export type FinishedPart = Schemas['FinishedPart'];
export type SubmittedInput = Schemas['SubmittedInput'];
export type Submission = Schemas['Submission'];
export type GradingResult = Schemas['GradingResult'];
export type GradingStatus = GradingResult['status'];
export type SubmittedFiles = Schemas['SubmittedFiles'];

/** The runner's list of outcomes, which a run and each of its tests take one of. */
export type Outcome = Schemas['GradedTest']['outcome'];
