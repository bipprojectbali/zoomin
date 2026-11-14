import { Loader2, Lock, Search, ShieldMinus, ShieldPlus } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminUser, GlobalRole } from "../../shared/api.types";
import { listUsers, setUserRole } from "../api.client";
import { RoleBadge } from "../app/RoleBadge";
import { UserAvatar } from "../app/UserAvatar";
import { errorMessage } from "../error.message";
import { GLOBAL_ROLE_LABEL } from "../role.global.label";
import { useSession } from "../session.context";
import { DevNotice, DevSectionHeader, PagerFooter } from "./DevParts";
import { DEV_TEXT } from "./dev.labels";
import { usePaged } from "./dev.paged";
import { roleActionFor } from "./dev.role.actions";

const T = DEV_TEXT.roles;
const PAGE_SIZE = 50;
const ALL = "all";
const ROLES: GlobalRole[] = ["super_admin", "admin", "user"];

type Pending = { user: AdminUser; to: "admin" | "user" };

/** Tab Admin & peran: super_admin mengangkat/menurunkan admin (A5) lewat PUT /api/dev/users/:id/role. */
export function RolesPanel() {
  const { user: me } = useSession();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<GlobalRole | typeof ALL>(ALL);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchPage = useCallback(
    (cursor: string | undefined) => listUsers({ q: query || undefined, role: role === ALL ? undefined : role, limit: PAGE_SIZE, cursor }),
    [query, role],
  );
  const users = usePaged(fetchPage, "pengguna");

  async function apply({ user, to }: Pending) {
    setBusyId(user.id);
    try {
      const res = await setUserRole(user.id, { role: to });
      users.setItems((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      toast.success(to === "admin" ? T.promoted(user.name) : T.demoted(user.name));
    } catch (err) {
      console.error(`dev: ubah peran user ${user.id} → ${to} gagal`, err);
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <DevSectionHeader title={DEV_TEXT.tabs.roles} description={T.description} />
      <form
        className="flex flex-col gap-2 sm:flex-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={T.searchLabel}
            placeholder={T.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setQuery(q.trim())}
            className="pl-8"
          />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as GlobalRole | typeof ALL)}>
          <SelectTrigger className="sm:w-44" aria-label={T.roleFilter}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{T.allRoles}</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {GLOBAL_ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>
      {users.error && <DevNotice onRetry={users.reload}>{users.error}</DevNotice>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3">{T.colUser}</TableHead>
              <TableHead>{T.colRole}</TableHead>
              <TableHead className="px-3 text-right">{T.colAction}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.items.map((u) => {
              const action = roleActionFor(u, me?.id ?? "");
              return (
                <TableRow key={u.id} data-testid="role-row" data-user-id={u.id} data-role={u.role}>
                  <TableCell className="px-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={u} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <RoleBadge role={u.role} />
                      {u.banned && <Badge variant="destructive">{T.banned}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 text-right">
                    {action === "promote" && (
                      <Button size="sm" variant="outline" data-testid="promote-admin" disabled={busyId === u.id} onClick={() => setPending({ user: u, to: "admin" })}>
                        {busyId === u.id ? <Loader2 className="animate-spin" /> : <ShieldPlus />}
                        {T.promote}
                      </Button>
                    )}
                    {action === "demote" && (
                      <Button size="sm" variant="outline" data-testid="demote-user" disabled={busyId === u.id} onClick={() => setPending({ user: u, to: "user" })}>
                        {busyId === u.id ? <Loader2 className="animate-spin" /> : <ShieldMinus />}
                        {T.demote}
                      </Button>
                    )}
                    {(action === "locked" || action === "self") && (
                      <span className="inline-flex items-center gap-1.5 text-xs whitespace-normal text-muted-foreground">
                        <Lock className="size-3.5 shrink-0" aria-hidden />
                        {action === "locked" ? T.locked : T.self}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!users.loading && users.items.length === 0 && !users.error && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  {DEV_TEXT.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <PagerFooter loading={users.loading} hasMore={users.hasMore} onMore={users.loadMore} />
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending && (pending.to === "admin" ? T.promoteTitle(pending.user.name) : T.demoteTitle(pending.user.name))}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.to === "admin" ? T.promoteBody : T.demoteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{T.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void apply(pending)}>{pending?.to === "admin" ? T.promote : T.demote}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
