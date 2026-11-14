import { LogIn } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SAFE_ID_PATTERN } from "../../shared/api.types";

const TEXT = {
  label: "Gabung dengan ID room",
  placeholder: "mis. rapat-desain",
  submit: "Gabung",
  invalid: "ID room hanya boleh huruf, angka, - atau _ (tanpa spasi), maks 64 karakter.",
};

const SAFE_ID = new RegExp(SAFE_ID_PATTERN);

/** Kolom "Gabung dengan ID room" (W4): navigasi ke /rooms/:id; room password menampilkan form password di sana. */
export function JoinByIdForm() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const roomId = id.trim();
    if (!SAFE_ID.test(roomId)) {
      setError(TEXT.invalid);
      return;
    }
    navigate(`/rooms/${encodeURIComponent(roomId)}`);
  }

  return (
    <form className="flex flex-col gap-1.5" onSubmit={onSubmit} aria-label={TEXT.label}>
      <label htmlFor="join-by-id" className="text-sm font-medium">
        {TEXT.label}
      </label>
      <div className="flex gap-2 sm:max-w-md">
        <Input
          id="join-by-id"
          data-testid="join-by-id-input"
          className="font-mono"
          placeholder={TEXT.placeholder}
          value={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "join-by-id-error" : undefined}
          onChange={(e) => {
            setId(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" variant="outline" data-testid="join-by-id-submit" disabled={!id.trim()}>
          <LogIn aria-hidden="true" />
          {TEXT.submit}
        </Button>
      </div>
      {error && (
        <p id="join-by-id-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
