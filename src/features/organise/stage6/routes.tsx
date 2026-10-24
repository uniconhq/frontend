import { type RouteObject } from 'react-router';
import { FormulaPage } from './FormulaPage';
import { Stage6Page } from './Stage6Page';
import { TaskMockPage } from './TaskMockPage';
import { WorkflowMockPage } from './WorkflowMockPage';

/** Dev-only screens. The router spreads these in while `import.meta.env.DEV`. */
export const stage6Routes: RouteObject[] = [
  { path: 'dev/stage-6', element: <Stage6Page /> },
  { path: 'dev/stage-6/workflow', element: <WorkflowMockPage /> },
  { path: 'dev/stage-6/formula', element: <FormulaPage /> },
  { path: 'dev/stage-6/task', element: <TaskMockPage /> },
];
