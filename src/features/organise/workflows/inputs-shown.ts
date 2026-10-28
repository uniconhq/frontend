import { useState } from 'react';

/** Where this browser keeps whether a workflow's graph draws its inputs and files. */
export const INPUTS_SHOWN_KEY = 'unicon.workflow-graph.inputs';

function remembered(): boolean {
  try {
    return window.localStorage.getItem(INPUTS_SHOWN_KEY) === 'shown';
  } catch {
    return false;
  }
}

/**
 * Whether a workflow's graph draws the inputs its steps read and the files of
 * the workflow they read, as this browser last chose; hidden until it chooses.
 * Without storage, as in a private window, the choice lasts until the page is
 * left.
 */
export function useInputsShown(): [boolean, (shown: boolean) => void] {
  const [shown, setShown] = useState(remembered);
  const choose = (next: boolean) => {
    setShown(next);
    try {
      window.localStorage.setItem(INPUTS_SHOWN_KEY, next ? 'shown' : 'hidden');
    } catch {
      // Kept for this page only.
    }
  };
  return [shown, choose];
}
