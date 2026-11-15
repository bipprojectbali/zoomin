/** Toast request stage untuk pengelola: Approve / Deny (S7). */
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { StageRequest } from "../../shared/api.types";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";

export const requestText = (req: StageRequest) => TEXT.incoming(req.userName, TEXT.requestAction[req.action]);

/** Toast ber-id = id request (di-dismiss saat request selesai); hidup sampai expiresAt. */
export function showRequestToast(req: StageRequest, onApprove: () => void, onDeny: () => void): void {
  toast.custom(
    () => (
      <div className="flex w-[356px] max-w-full items-center gap-3 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
        <p className="min-w-0 flex-1">{requestText(req)}</p>
        <Button type="button" size="sm" data-testid="stage-request-approve" onClick={onApprove}>
          {TEXT.approve}
        </Button>
        <Button type="button" size="sm" variant="outline" data-testid="stage-request-deny" onClick={onDeny}>
          {TEXT.deny}
        </Button>
      </div>
    ),
    { id: req.id, duration: Math.max(0, req.expiresAt - Date.now()) },
  );
}
