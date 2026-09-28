import type { components } from './schema';

/** The backend's schemas under the names the app uses for them. */
type Schemas = components['schemas'];

export type Me = Schemas['Me'];
export type Scope = Schemas['Scope'];
export type SessionInfo = Schemas['SessionInfo'];
