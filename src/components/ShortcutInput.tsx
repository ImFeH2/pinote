import { useCallback, useState, type KeyboardEvent } from "react";
import { eventToShortcut } from "@/lib/shortcuts";

interface ShortcutInputProps {
  label: string;
  value: string;
  onChange: (next: string) => void | Promise<void>;
}

export function ShortcutInput({ label, value, onChange }: ShortcutInputProps) {
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      const next = eventToShortcut(event);
      if (!next) return;
      setIsRecording(false);
      void onChange(next);
    },
    [onChange],
  );

  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        readOnly
        value={isRecording ? "Press keys..." : value}
        onFocus={() => setIsRecording(true)}
        onBlur={() => setIsRecording(false)}
        onKeyDown={handleKeyDown}
        className="w-36 rounded-md border border-border bg-background px-2 py-1 text-right text-xs text-foreground outline-none transition-colors focus:border-primary"
      />
    </label>
  );
}
