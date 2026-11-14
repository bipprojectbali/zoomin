import type { RoomStatus, RoomVisibility } from "../../shared/api.types";

/** Label UI pengaturan room, badge kartu room, dan opsi buat room (RND/plan/06 §UI). */
export const ROOM_SETTINGS_TEXT = {
  title: "Room settings",
  description: (title: string) => `Manage room "${title}".`,
  tabGeneral: "General",
  tabMembers: "Members",
  tabStatus: "Status",
  tabDanger: "Danger zone",
  // Umum
  roomTitle: "Room title",
  visibility: "Room type",
  save: "Save",
  saving: "Saving…",
  saved: "Settings saved",
  privateConfirmTitle: "Make the room private?",
  privateConfirmBody: "Invite links already shared will stop working. Only members and people you invite by email can join.",
  privateConfirmSubmit: "Make private",
  cancel: "Cancel",
  // Anggota
  memberEmail: "Email",
  memberEmailPlaceholder: "name@company.com",
  memberRole: "Role",
  memberAdd: "Add",
  memberAdded: (email: string) => `${email} added`,
  memberAddHint: "No account yet? The invite stays pending until that person signs in with this email.",
  memberRoleFor: (who: string) => `Role for ${who}`,
  memberRemove: (who: string) => `Remove ${who}`,
  memberRemoved: (who: string) => `${who} removed`,
  inviteCancel: (email: string) => `Cancel invite for ${email}`,
  inviteCanceled: (email: string) => `Invite for ${email} canceled`,
  roleUpdated: "Role updated",
  pending: "Pending",
  membersEmpty: "No members yet.",
  membersLoading: "Loading members…",
  loadMore: "Load more",
  // Status
  active: "Room active",
  activeHint: "Deactivate to close the room temporarily. All participants are disconnected immediately.",
  activated: "Room activated",
  deactivated: "Room deactivated",
  expiry: "Expires",
  expiryNone: "Never",
  expiryAt: (when: string) => `Expires ${when}`,
  expiredAt: (when: string) => `Expired ${when}`,
  extend: (days: number) => `+${days} ${days === 1 ? "day" : "days"}`,
  extendLabel: (days: number) => `Extend by ${days} ${days === 1 ? "day" : "days"}`,
  expiryDate: "Pick a date",
  expirySet: "Set",
  expiryUpdated: "Expiry updated",
  expiryInvalid: "Pick a time in the future, at most 365 days ahead.",
  // Zona bahaya
  deleteHeading: "Delete room",
  deleteBody: "The room, its members, layout, and invites are permanently deleted. Anyone in the room will be disconnected.",
  deleteOpen: "Delete room…",
  deleteTitle: (title: string) => `Delete room "${title}"?`,
  deleted: (title: string) => `Room "${title}" deleted`,
  // Kartu room
  menu: (title: string) => `Room actions for ${title}`,
  menuSettings: "Settings",
  menuInvite: "Invite",
  menuDelete: "Delete",
  // Buat room
  expiryPreset: { none: "Never", "1": "1 day", "7": "7 days", "30": "30 days", custom: "Pick a date" },
  // Admin
  colType: "Type",
  colLive: "Live",
  notLive: "Not live",
} as const;

/** Label + deskripsi singkat tiap tipe room. */
export const VISIBILITY_TEXT: Record<RoomVisibility, { label: string; hint: string }> = {
  public: { label: "Public", hint: "Anyone with the invite link can join" },
  password: { label: "Password", hint: "Anyone with the link or room ID plus the password can join" },
  private: { label: "Private", hint: "Only people you invite by email" },
};

/** Label badge status + alasan Masuk di-disable. */
export const STATUS_TEXT: Record<RoomStatus, { label: string; reason: string }> = {
  active: { label: "Active", reason: "" },
  inactive: { label: "Inactive", reason: "The host deactivated this room. Ask the host to reactivate it." },
  expired: { label: "Expired", reason: "This room has expired. Ask the host to extend it." },
};
