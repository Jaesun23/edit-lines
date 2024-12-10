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
    const result = await editFile({
      p: savedState.path,
      e: savedState.edits
    });

    // Only delete the state if the edit was successful
    stateManager.deleteState(stateId);
    return result;
  } catch (error) {
    // If anything fails, preserve the state and re-throw
    throw error;
  }
}
