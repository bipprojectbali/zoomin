/** Label UI pemilih undangan (RND/plan/07-invite-picker.md, 09-invite-multiselect.md). */
export const INVITE_PICKER_TEXT = {
  label: "Invite people",
  placeholder: "Pick or search people, or type an email",
  hint: "Unregistered emails can still be invited: access starts once that person signs in with Google using that email.",
  add: (email: string) => `Add ${email}`,
  savedBadge: "Manual",
  removeSaved: (email: string) => `Remove ${email} from the list`,
  empty: "No accounts",
  searching: "Searching…",
  invalid: "Invalid email",
  invalidCount: (n: number) => `${n} invalid ${n === 1 ? "email" : "emails"} won't be sent.`,
  roleFor: (who: string) => `Role for ${who}`,
  remove: (who: string) => `Remove ${who}`,
  submit: "Add",
  summary: (ok: number, failed: number) => (failed ? `${ok} added, ${failed} failed` : `${ok} added`),
  failedItem: (email: string, reason: string) => `${email}: ${reason}`,
} as const;
