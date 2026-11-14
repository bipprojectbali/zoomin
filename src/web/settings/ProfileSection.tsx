import { ImageOff, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { updateMe } from "@/api.client";
import { RoleBadge } from "@/app/RoleBadge";
import { UserAvatar } from "@/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/error.message";
import { useSession } from "@/session.context";
import type { ProfileUpdateBody, SessionUser } from "../../shared/api.types";
import { isValidName, NAME_MAX, SETTINGS_TEXT } from "./settings.labels";

const TEXT = SETTINGS_TEXT.profile;

/** Profil: avatar, nama tampilan (1–60), reset foto ke Google, email read-only, badge peran. */
export function ProfileSection({ user }: { user: SessionUser }) {
  const { refresh } = useSession();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState<"name" | "photo" | null>(null);
  const valid = isValidName(name);
  const dirty = name.trim() !== user.name;

  async function save(body: ProfileUpdateBody, kind: "name" | "photo") {
    setBusy(kind);
    try {
      await updateMe(body);
      await refresh();
      toast.success(kind === "name" ? TEXT.saved : TEXT.photoReset);
    } catch (err) {
      console.error("settings: PATCH /api/me gagal", err);
      toast.error(TEXT.failed(errorMessage(err)));
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (valid && dirty) void save({ name: name.trim() }, "name");
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar user={user} className="size-16 text-lg" />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <RoleBadge role={user.role} />
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void save({ image: null }, "photo")}>
            {busy === "photo" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
            {TEXT.useGooglePhoto}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-name">{TEXT.name}</Label>
        <Input
          id="settings-name"
          data-testid="settings-name"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!valid || undefined}
          aria-describedby="settings-name-hint"
        />
        <p id="settings-name-hint" className={valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {valid ? TEXT.nameHint(name.trim().length, NAME_MAX) : TEXT.nameInvalid(NAME_MAX)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-email">{TEXT.email}</Label>
        <Input id="settings-email" value={user.email} readOnly aria-describedby="settings-email-hint" className="bg-muted/50" />
        <p id="settings-email-hint" className="text-xs text-muted-foreground">
          {TEXT.emailHint}
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" data-testid="settings-save" disabled={!valid || !dirty || busy !== null}>
          {busy === "name" && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy === "name" ? TEXT.saving : TEXT.save}
        </Button>
      </div>
    </form>
  );
}
