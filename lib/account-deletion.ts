export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

export type AccountDeletionFormState = "idle" | "ready" | "pending" | "error";

export function accountDeletionFormState(params: {
  confirmation: string;
  pending: boolean;
  error: string | null;
}): AccountDeletionFormState {
  if (params.pending) return "pending";
  if (params.error !== null) return "error";
  return params.confirmation === ACCOUNT_DELETION_CONFIRMATION ? "ready" : "idle";
}
