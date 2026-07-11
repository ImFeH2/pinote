import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

interface SettingsNumberInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  suffix?: string;
  precision?: number;
  onValueChange: (value: number) => void;
}

export function SettingsNumberInput({
  value,
  min,
  max,
  step,
  label,
  suffix,
  precision = 0,
  onValueChange,
}: SettingsNumberInputProps) {
  const formatValue = (nextValue: number) => nextValue.toFixed(precision);
  const [draft, setDraft] = useState(() => formatValue(value));

  useEffect(() => {
    setDraft(value.toFixed(precision));
  }, [value, precision]);

  const commit = (nextValue: number) => {
    const clamped = Math.min(max, Math.max(min, nextValue));
    const rounded = Number(clamped.toFixed(precision));
    setDraft(formatValue(rounded));
    onValueChange(rounded);
  };

  const commitDraft = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(formatValue(value));
      return;
    }
    commit(parsed);
  };

  return (
    <div className="flex h-8 w-28 overflow-hidden rounded-md border border-border bg-background transition-colors focus-within:border-primary">
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitDraft();
              event.currentTarget.blur();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              commit(value + step);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              commit(value - step);
            }
          }}
          className="h-full w-full bg-transparent px-2 pr-7 text-right text-xs tabular-nums text-foreground outline-none"
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      <div className="flex w-6 shrink-0 flex-col border-l border-border">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} +${step}`}
          onClick={() => commit(value + step)}
          className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label} -${step}`}
          onClick={() => commit(value - step)}
          className="flex min-h-0 flex-1 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
