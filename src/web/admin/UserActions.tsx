import { Ban, LogOut, MoreHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { banUser, deleteUser, revokeUserSessions, unbanUser } from "@/api.client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/error.message";
import type { AdminUser, BanUserBody, SessionUser } from "../../shared/api.types";
import { ADMIN_TEXT as TEXT } from "./admin.labels";
import { isBanActive } from "./admin.format";
import { canManageUser } from "./admin.permissions";
import { BanDialog } from "./BanDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

const MS_PER_HOUR = 3_600_000;

/** Operasi list yang dipakai untuk update optimis. */
export type UserListOps = {
  replace: (user: AdminUser) => void;
  /** Hapus baris; mengembalikan fungsi untuk memulihkannya di posisi semula. */
  remove: (userId: string) => () => void;
};

type Props = { user: AdminUser; actor: SessionUser; ops: UserListOps };

/** Menu "⋯" per baris pengguna + dialog blokir/hapus. Update optimis, rollback + toast bila gagal. */
export function UserActions({ user, actor, ops }: Props) {
  const [dialog, setDialog] = useState<"ban" | "delete" | null>(null);
  const allowed = canManageUser(actor, user);
  const banned = isBanActive(user, Date.now());

  async function run<T>(op: string, call: () => Promise<T>, rollback: () => void, success: string): Promise<T> {
    try {
      const res = await call();
      toast.success(success);
      return res;
    } catch (err) {
      rollback();
      console.error(`admin: ${op} gagal untuk user ${user.id}`, err);
      toast.error(errorMessage(err));
      throw err;
    }
  }

  async function ban(body: BanUserBody) {
    const expires = body.expiresInHours === undefined ? null : Date.now() + body.expiresInHours * MS_PER_HOUR;
    ops.replace({ ...user, banned: true, banReason: body.reason, banExpires: expires });
    const res = await run("ban", () => banUser(user.id, body), () => ops.replace(user), TEXT.banned(user.name));
    ops.replace(res.user);
  }

  function unban() {
    ops.replace({ ...user, banned: false, banReason: null, banExpires: null });
    run("unban", () => unbanUser(user.id), () => ops.replace(user), TEXT.unbanned(user.name)).then(
      (res) => ops.replace(res.user),
      () => {}, // sudah di-rollback + toast di run()
    );
  }

  function revoke() {
    run("revoke sessions", () => revokeUserSessions(user.id), () => {}, TEXT.sessionsRevoked(user.name)).catch(() => {}); // sudah toast di run()
  }

  async function remove() {
    const restore = ops.remove(user.id);
    await run("delete", () => deleteUser(user.id), restore, TEXT.userDeleted(user.name));
  }

  if (!allowed) {
    return (
      <Button type="button" variant="ghost" size="icon-sm" disabled aria-label={TEXT.noActions} title={TEXT.noActions} data-testid="user-actions">
        <MoreHorizontal />
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={TEXT.actionsFor(user.name)} data-testid="user-actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
          {banned ? (
            <DropdownMenuItem onSelect={unban} data-testid="unban">
              <ShieldCheck />
              {TEXT.unban}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog("ban")} data-testid="ban">
              <Ban />
              {TEXT.ban}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={revoke} data-testid="revoke-sessions">
            <LogOut />
            {TEXT.revokeSessions}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")} data-testid="delete-user">
            <Trash2 />
            {TEXT.deleteUser}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BanDialog user={user} open={dialog === "ban"} onOpenChange={(o) => setDialog(o ? "ban" : null)} onSubmit={ban} />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(o) => setDialog(o ? "delete" : null)}
        title={TEXT.deleteTitle}
        description={TEXT.deleteDescription(user.name)}
        submitLabel={TEXT.deleteSubmit}
        confirmText={user.email}
        secondary={
          !banned && (
            <Button type="button" variant="ghost" onClick={() => setDialog("ban")}>
              <Ban />
              {TEXT.deleteSuggestBan}
            </Button>
          )
        }
        onConfirm={remove}
      />
    </>
  );
}
