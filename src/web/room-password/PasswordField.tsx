import { Copy, Eye, EyeOff, Shuffle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText } from "@/clipboard.copy";
import { ROOM_PASSWORD_MAX, ROOM_PASSWORD_MIN } from "../../shared/api.types";
import { generatePassword } from "./password.generate";
import { ROOM_PASSWORD_TEXT as TEXT } from "./room-password.labels";

/** Salin password + toast; gagal → toast error (pengguna masih bisa salin manual dari kolom). */
export async function copyPassword(password: string): Promise<void> {
  try {
    await copyText(password);
    toast.success(TEXT.copied);
  } catch (err) {
    console.warn("room-password: salin gagal", err);
    toast.error(TEXT.copyFailed);
  }
}

type Props = { id: string; value: string; onChange: (v: string) => void; disabled?: boolean; autoFocus?: boolean };

/** Kolom password room (W2): tampilkan/sembunyikan, Buat acak (langsung ditampilkan), salin. Panjang divalidasi native. */
export function PasswordField({ id, value, onChange, disabled, autoFocus }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{TEXT.label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            data-testid="password-field-input"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            className="pr-9 font-mono"
            required
            minLength={ROOM_PASSWORD_MIN}
            maxLength={ROOM_PASSWORD_MAX}
            value={value}
            disabled={disabled}
            autoFocus={autoFocus}
            aria-describedby={`${id}-hint`}
            onChange={(e) => onChange(e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0 size-9"
            data-testid="password-field-toggle"
            aria-label={visible ? TEXT.hide : TEXT.show}
            aria-pressed={visible}
            disabled={disabled}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          data-testid="password-field-generate"
          disabled={disabled}
          onClick={() => {
            onChange(generatePassword());
            setVisible(true);
          }}
        >
          <Shuffle aria-hidden="true" />
          {TEXT.generate}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          data-testid="password-field-copy"
          aria-label={TEXT.copy}
          disabled={disabled || !value}
          onClick={() => void copyPassword(value)}
        >
          <Copy aria-hidden="true" />
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {TEXT.hint}
      </p>
    </div>
  );
}
