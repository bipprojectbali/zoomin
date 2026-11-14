import { Search, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listUsers } from "@/api.client";
import { RoleBadge } from "@/app/RoleBadge";
import { UserAvatar } from "@/app/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOBAL_ROLE_LABEL } from "@/role.global.label";
import type { AdminUser, SessionUser } from "../../shared/api.types";
import { ListEmpty, ListError, ListSkeleton, LoadMoreButton } from "./AdminListStates";
import { ROLE_FILTERS, usersQuery, type RoleFilter, type StatusFilter } from "./admin.filters";
import { formatDate, formatDateTime, formatRelative, isBanActive, userStatusLabel } from "./admin.format";
import { ADMIN_TEXT as TEXT } from "./admin.labels";
import { UserActions, type UserListOps } from "./UserActions";
import { useCursorList } from "./useCursorList";
import { useMediaQuery } from "./useMediaQuery";

const SEARCH_DEBOUNCE_MS = 300;
const DESKTOP_QUERY = "(min-width: 768px)";

/** Tab "Pengguna": pencarian, filter peran/status, tabel (desktop) / kartu (mobile), aksi per baris. */
export function UsersPanel({ actor }: { actor: SessionUser }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const desktop = useMediaQuery(DESKTOP_QUERY);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback((cursor?: string) => listUsers(usersQuery(q, role, status, cursor)), [q, role, status]);
  const list = useCursorList<AdminUser>(fetchPage, `${q}|${role}|${status}`);
  const { setItems } = list;

  const ops = useMemo<UserListOps>(
    () => ({
      replace: (user) => setItems((prev) => prev.map((u) => (u.id === user.id ? user : u))),
      remove: (userId) => {
        let index = -1;
        let removed: AdminUser | undefined;
        setItems((prev) => {
          index = prev.findIndex((u) => u.id === userId);
          removed = prev[index];
          return prev.filter((u) => u.id !== userId);
        });
        return () => setItems((prev) => (removed ? [...prev.slice(0, index), removed, ...prev.slice(index)] : prev));
      },
    }),
    [setItems],
  );

  const filtered = q !== "" || role !== "all" || status !== "all";
  const clear = () => {
    setSearch("");
    setQ("");
    setRole("all");
    setStatus("all");
  };
  const initialLoading = list.loading && list.items.length === 0;
  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={TEXT.searchPlaceholder}
            aria-label={TEXT.searchLabel}
            className="pl-8"
            data-testid="admin-search"
          />
        </div>
        <div className="flex gap-2">
          <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
            <SelectTrigger aria-label={TEXT.filterRole} className="flex-1 sm:w-40" data-testid="admin-filter-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{TEXT.allRoles}</SelectItem>
              {ROLE_FILTERS.map((r) => (
                <SelectItem key={r} value={r}>
                  {GLOBAL_ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger aria-label={TEXT.filterStatus} className="flex-1 sm:w-40" data-testid="admin-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{TEXT.allStatus}</SelectItem>
              <SelectItem value="active">{TEXT.statusActive}</SelectItem>
              <SelectItem value="banned">{TEXT.statusBanned}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.error && list.items.length === 0 ? (
        <ListError message={list.error} onRetry={list.reload} />
      ) : initialLoading ? (
        <ListSkeleton />
      ) : list.items.length === 0 ? (
        <ListEmpty
          icon={Users}
          title={TEXT.usersEmptyTitle}
          body={filtered ? TEXT.usersEmptyFiltered : TEXT.usersEmptyBody}
          action={
            filtered && (
              <Button type="button" variant="outline" size="sm" onClick={clear}>
                <X />
                {TEXT.clearFilters}
              </Button>
            )
          }
        />
      ) : desktop ? (
        <div className="rounded-lg border" aria-busy={list.loading}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">{TEXT.colUser}</TableHead>
                <TableHead>{TEXT.colRole}</TableHead>
                <TableHead>{TEXT.colStatus}</TableHead>
                <TableHead>{TEXT.colCreated}</TableHead>
                <TableHead>{TEXT.colLastActive}</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">{TEXT.colActions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((u) => (
                <TableRow key={u.id} {...rowAttrs(u, now)}>
                  <TableCell className="pl-4">
                    <UserIdentity user={u} isSelf={u.id === actor.id} />
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell>
                    <UserStatus user={u} now={now} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{formatDate(u.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground" title={u.lastActiveAt ? formatDateTime(u.lastActiveAt) : undefined}>
                    {formatRelative(u.lastActiveAt, now)}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <UserActions user={u} actor={actor} ops={ops} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border" aria-busy={list.loading}>
          {list.items.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 p-3" {...rowAttrs(u, now)}>
              <div className="flex items-start justify-between gap-2">
                <UserIdentity user={u} isSelf={u.id === actor.id} />
                <UserActions user={u} actor={actor} ops={ops} />
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-11 text-xs text-muted-foreground">
                <RoleBadge role={u.role} />
                <UserStatus user={u} now={now} />
                <span>
                  {TEXT.colLastActive}: {formatRelative(u.lastActiveAt, now)}
                </span>
              </div>
              {isBanActive(u, now) && u.banReason && <p className="pl-11 text-xs text-muted-foreground">{TEXT.bannedReason(u.banReason)}</p>}
            </li>
          ))}
        </ul>
      )}

      {list.error && list.items.length > 0 && <p className="text-center text-sm text-destructive" role="alert">{list.error}</p>}
      {list.hasMore && list.items.length > 0 && <LoadMoreButton loading={list.loading} onClick={list.loadMore} />}
    </div>
  );
}

function rowAttrs(u: AdminUser, now: number) {
  return { "data-testid": "user-row", "data-user-id": u.id, "data-role": u.role, "data-banned": String(isBanActive(u, now)) };
}

function UserIdentity({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar user={user} />
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 truncate font-medium">
          {user.name}
          {isSelf && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {TEXT.you}
            </Badge>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
    </div>
  );
}

function UserStatus({ user, now }: { user: AdminUser; now: number }) {
  const s = userStatusLabel(user, now);
  if (!s.detail) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {s.label}
      </span>
    );
  }
  const badge = (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        {s.label}
      </Badge>
      <span className="text-xs text-muted-foreground">{s.detail}</span>
    </span>
  );
  if (!user.banReason) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`${s.label}, ${s.detail}. ${TEXT.bannedReason(user.banReason)}`}>
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{TEXT.bannedReason(user.banReason)}</TooltipContent>
    </Tooltip>
  );
}
