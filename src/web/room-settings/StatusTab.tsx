import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lobby/lobby.format";
import type { RoomSummary } from "../../shared/api.types";
import { EXTEND_DAYS, extendExpiry, fromLocalInput, isExpiryInRange, maxExpiry, toLocalInput } from "./room.expiry";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";
import { useRoomPatch } from "./useRoomPatch";

/** Tab Status: Switch aktif + kadaluarsa (tombol cepat dari max(now, expiresAt), tanpa batas, tanggal) (R5, R7). */
export function StatusTab({ room, onChanged }: { room: RoomSummary; onChanged: (room: RoomSummary) => void }) {
  const { busy, patch } = useRoomPatch(room.id, onChanged);
  const [date, setDate] = useState("");
  const now = Date.now();
  const picked = fromLocalInput(date);
  const pickedValid = picked !== null && isExpiryInRange(picked, now);
  const expired = room.expiresAt !== null && room.expiresAt <= now;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="room-active-switch">{TEXT.active}</Label>
          <p className="text-xs text-muted-foreground">{TEXT.activeHint}</p>
        </div>
        <Switch
          id="room-active-switch"
          data-testid="room-active-switch"
          checked={room.status !== "inactive"}
          disabled={busy}
          onCheckedChange={(enabled) => void patch({ enabled }, enabled ? TEXT.activated : TEXT.deactivated)}
        />
      </div>

      <fieldset className="flex flex-col gap-3" disabled={busy}>
        <legend className="mb-1 text-sm font-medium">{TEXT.expiry}</legend>
        <p className="text-sm" data-testid="expiry-current" aria-live="polite">
          {room.expiresAt === null
            ? TEXT.expiryNone
            : (expired ? TEXT.expiredAt : TEXT.expiryAt)(formatDateTime(room.expiresAt))}
        </p>
        <div className="flex flex-wrap gap-2">
          {EXTEND_DAYS.map((days) => {
            const next = extendExpiry(room.expiresAt, days, now);
            return (
              <Button
                key={days}
                type="button"
                size="sm"
                variant="outline"
                data-testid="expiry-extend"
                data-days={days}
                aria-label={TEXT.extendLabel(days)}
                disabled={next > maxExpiry(now)}
                onClick={() => void patch({ expiresAt: extendExpiry(room.expiresAt, days, Date.now()) }, TEXT.expiryUpdated)}
              >
                {TEXT.extend(days)}
              </Button>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="expiry-none"
            disabled={room.expiresAt === null}
            onClick={() => void patch({ expiresAt: null }, TEXT.expiryUpdated)}
          >
            {TEXT.expiryNone}
          </Button>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (picked !== null && pickedValid) void patch({ expiresAt: picked }, TEXT.expiryUpdated).then((ok) => ok && setDate(""));
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="expiry-date-input" className="font-normal text-muted-foreground">
              {TEXT.expiryDate}
            </Label>
            <Input
              id="expiry-date-input"
              data-testid="expiry-date-input"
              type="datetime-local"
              min={toLocalInput(now)}
              max={toLocalInput(maxExpiry(now))}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={date !== "" && !pickedValid}
              aria-describedby={date !== "" && !pickedValid ? "expiry-date-error" : undefined}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" data-testid="expiry-date-save" disabled={!pickedValid}>
            {TEXT.expirySet}
          </Button>
        </form>
        {date !== "" && !pickedValid && (
          <p id="expiry-date-error" className="text-xs text-destructive">
            {TEXT.expiryInvalid}
          </p>
        )}
      </fieldset>
    </div>
  );
}
