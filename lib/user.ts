// No login: the app has a single planner (PRD §3), recorded on every approval, override and settings change.
export const PLANNER_NAME = "Raghav";

export async function currentUser(): Promise<string> {
  return PLANNER_NAME;
}
