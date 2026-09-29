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
