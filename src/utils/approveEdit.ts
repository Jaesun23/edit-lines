// utils/approveEdit.ts
import { editFile } from "./fileEditor.js";
import { StateManager } from "./stateManager.js";

export async function approveEdit(
  stateId: string,
  stateManager: StateManager
): Promise<string> {
  const savedState = stateManager.getState(stateId);
  if (!savedState) {
    throw new Error("Invalid or expired state ID");
  }

  try {
    // Get saved edit state
    const { diff } = await editFile(
      savedState.path,
      savedState.edits,
      false // Not a dry run - actually apply the changes
    );

    // Only delete the state if the edit was successful
    stateManager.deleteState(stateId);

    return diff;
  } catch (error) {
    // If anything fails, preserve the state and re-throw
    throw error;
  }
}

/**
 * Verify if an edit state exists and is valid
 */
export function verifyEditState(
  stateId: string,
  stateManager: StateManager
): boolean {
  return stateManager.isStateValid(stateId);
}
