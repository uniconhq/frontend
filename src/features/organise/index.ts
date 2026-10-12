import type { ComponentType } from 'react';
import type { ContestSectionKey, OrgSectionKey, TaskSectionKey } from '@/lib/sections';
import {
  ContestAnnouncementsPage,
  ContestOrganisersPage,
  ContestQuestionsPage,
  ContestSettingsPage,
} from './contest/ContestSections';
import { GradingsFeedPage } from './gradings/GradingsFeedPage';
import { OrganisedBoardsPage } from './boards/OrganisedBoardsPage';
import { OrgOrganisersPage, OrgSettingsPage } from './org/OrgSections';
import {
  TaskAnnouncementsPage,
  TaskGradingsPage,
  TaskOrganisersPage,
  TaskPublicationsPage,
  TaskSettingsPage,
} from './task/TaskSections';
import { ContestEntryPage } from './contest/EntryPage';
import { EntrantsPage } from './entrants/EntrantsPage';
import { InboxPage } from './threads/Clarifications';

export { OrgsPage } from './orgs/OrgsPage';
export { NewOrgPage } from './orgs/NewOrgPage';
export { OrgPage } from './org/OrgPage';
export { ContestPage } from './contest/ContestPage';
export { TaskPage } from './task/TaskPage';
export { WorkflowsPage } from './workflows/WorkflowsPage';
export { WorkflowPage } from './workflows/WorkflowPage';
export { viewFilePath } from './contest/places';

/**
 * Each section's page, by its key in its level's list, so the route table
 * gives every section in the list a page and none outside it.
 */
export const ORG_SECTION_PAGES: Record<OrgSectionKey, ComponentType> = {
  organisers: OrgOrganisersPage,
  questions: InboxPage,
  settings: OrgSettingsPage,
};

export const CONTEST_SECTION_PAGES: Record<ContestSectionKey, ComponentType> = {
  settings: ContestSettingsPage,
  entry: ContestEntryPage,
  entrants: EntrantsPage,
  gradings: GradingsFeedPage,
  boards: OrganisedBoardsPage,
  announcements: ContestAnnouncementsPage,
  questions: ContestQuestionsPage,
  organisers: ContestOrganisersPage,
};

export const TASK_SECTION_PAGES: Record<TaskSectionKey, ComponentType> = {
  gradings: TaskGradingsPage,
  publications: TaskPublicationsPage,
  announcements: TaskAnnouncementsPage,
  organisers: TaskOrganisersPage,
  settings: TaskSettingsPage,
};
