import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { Fragment, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AuditAction } from "../../shared/api.types";
import { listAudit } from "../api.client";
import { formatDateTime } from "../lobby/lobby.format";
import { DevNotice, DevSectionHeader, PagerFooter } from "./DevParts";
import { formatRelative, summarizeDetail } from "./dev.format";
import { AUDIT_ACTION_LABEL, AUDIT_ACTIONS, DEV_TEXT } from "./dev.labels";
import { usePaged } from "./dev.paged";

const T = DEV_TEXT.audit;
const PAGE_SIZE = 50;
const ALL = "all";
const COLUMNS = 5;

/** Tab Audit log (A8): aksi admin/dev terbaru, filter per aksi, paginasi cursor. */
export function AuditPanel() {
  const [action, setAction] = useState<AuditAction | typeof ALL>(ALL);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const fetchPage = useCallback(
    (cursor: string | undefined) => listAudit({ action: action === ALL ? undefined : action, limit: PAGE_SIZE, cursor }),
    [action],
  );
  const audit = usePaged(fetchPage, "audit log");
  const now = Date.now();

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section className="flex flex-col gap-4">
      <DevSectionHeader
        title={DEV_TEXT.tabs.audit}
        actions={
          <>
            <Select value={action} onValueChange={(v) => setAction(v as AuditAction | typeof ALL)}>
              <SelectTrigger className="w-48" size="sm" aria-label={T.actionFilter}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{T.allActions}</SelectItem>
                {AUDIT_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIT_ACTION_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={audit.reload} disabled={audit.loading}>
              <RotateCw />
              {DEV_TEXT.reload}
            </Button>
          </>
        }
      />
      {audit.error && <DevNotice onRetry={audit.reload}>{audit.error}</DevNotice>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3">{T.colTime}</TableHead>
              <TableHead>{T.colActor}</TableHead>
              <TableHead>{T.colAction}</TableHead>
              <TableHead>{T.colTarget}</TableHead>
              <TableHead className="px-3">{T.colDetail}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.items.map((e) => {
              const expanded = open.has(e.id);
              return (
                <Fragment key={e.id}>
                  <TableRow data-testid="audit-row" data-action={e.action}>
                    <TableCell className="px-3 text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <time dateTime={new Date(e.at).toISOString()} tabIndex={0} className="cursor-default rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                            {formatRelative(e.at, now)}
                          </time>
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTime(e.at)}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="max-w-56 truncate" title={e.actorEmail}>
                      {e.actorEmail}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{AUDIT_ACTION_LABEL[e.action] ?? e.action}</span>
                    </TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs" title={`${e.targetType}:${e.targetId}`}>
                      <span className="text-muted-foreground">{e.targetType}:</span>
                      {e.targetId}
                    </TableCell>
                    <TableCell className="px-3">
                      <button
                        type="button"
                        className="flex max-w-80 items-center gap-1 rounded-sm text-left font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        aria-expanded={expanded}
                        aria-label={expanded ? T.hideDetail : T.showDetail}
                        onClick={() => toggle(e.id)}
                      >
                        {expanded ? <ChevronDown className="size-3.5 shrink-0" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                        <span className="truncate">{summarizeDetail(e.detail)}</span>
                      </button>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={COLUMNS} className="px-3">
                        <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
                          {JSON.stringify(e.detail, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!audit.loading && audit.items.length === 0 && !audit.error && (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="py-8 text-center text-muted-foreground">
                  {DEV_TEXT.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <PagerFooter loading={audit.loading} hasMore={audit.hasMore} onMore={audit.loadMore} />
    </section>
  );
}
