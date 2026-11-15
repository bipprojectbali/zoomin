/** Antrean request stage untuk pengelola (S7): tombol + badge jumlah, popover berisi Approve/Deny per request. */
import { Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { StageRequest } from "../../shared/api.types";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";
import { requestText } from "./StageRequestToast";

export function StageRequestsPanel({ queue, onApprove, onDeny }: {
  queue: StageRequest[];
  onApprove: (req: StageRequest) => void;
  onDeny: (req: StageRequest) => void;
}) {
  const label = TEXT.queue(queue.length);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="relative" aria-label={label} data-testid="stage-requests" data-count={queue.length}>
          <Hand aria-hidden="true" />
          {queue.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">
              {queue.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {queue.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{TEXT.queueEmpty}</p>}
        <ul className="flex flex-col gap-1">
          {queue.map((req) => (
            <li key={req.id} className="flex items-center gap-2 px-2 py-1.5 text-sm" data-testid="stage-request-item">
              <span className="min-w-0 flex-1">{requestText(req)}</span>
              <Button type="button" size="xs" data-testid="stage-request-approve" onClick={() => onApprove(req)}>
                {TEXT.approve}
              </Button>
              <Button type="button" size="xs" variant="outline" data-testid="stage-request-deny" onClick={() => onDeny(req)}>
                {TEXT.deny}
              </Button>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
