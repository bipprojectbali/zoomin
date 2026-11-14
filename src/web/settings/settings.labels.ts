/** Label halaman /settings (Profile & account). */
export const SETTINGS_TEXT = {
  title: "Profile & account",
  profile: {
    title: "Profile",
    description: "Other participants in a room see this name and photo.",
    name: "Display name",
    nameHint: (n: number, max: number) => `${n}/${max} characters`,
    nameInvalid: (max: number) => `Name is required, up to ${max} characters.`,
    email: "Email",
    emailHint: "Your email comes from your Google account and can't be changed here.",
    role: "Role",
    save: "Save",
    saving: "Saving…",
    saved: "Profile saved",
    useGooglePhoto: "Use Google photo",
    photoReset: "Photo reset to your Google photo",
    failed: (msg: string) => `Couldn't save profile. ${msg}`,
  },
  sessions: {
    title: "Active sessions",
    description: "Devices currently signed in to your account. Revoke any session you don't recognize.",
    loading: "Loading sessions…",
    loadFailed: "Couldn't load sessions.",
    retry: "Try again",
    thisDevice: "This device",
    unknownIp: "Unknown IP",
    since: (when: string) => `Signed in ${when}`,
    revoke: "Revoke",
    revoked: "Session revoked",
    revokeOthers: "Sign out of all other devices",
    revokedOthers: "Signed out of all other devices",
    noOthers: "No other devices are signed in.",
    failed: (msg: string) => `Couldn't revoke session. ${msg}`,
  },
  danger: {
    title: "Danger zone",
    description: "Deleting your account removes you from every room and can't be undone.",
    delete: "Delete account",
    superAdminReason: "Super admin accounts are managed via SUPER_ADMIN_EMAILS on the server and can't be deleted here.",
    confirmTitle: "Permanently delete your account?",
    confirmBody: (email: string) => `Type ${email} to confirm. All your room memberships will be removed.`,
    confirmLabel: "Confirmation email",
    cancel: "Cancel",
    confirm: "Delete my account",
    deleting: "Deleting…",
    deleted: "Your account has been deleted",
    failed: (msg: string) => `Couldn't delete account. ${msg}`,
  },
} as const;

/** Batas nama tampilan (sama dengan validasi server PATCH /api/me). */
export const NAME_MAX = 60;

/** Nama valid: 1–60 karakter setelah trim. */
export function isValidName(name: string): boolean {
  const n = name.trim().length;
  return n >= 1 && n <= NAME_MAX;
}
