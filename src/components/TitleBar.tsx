import { useState, useRef, useEffect } from "react";
import { Pin, PinOff, X, Moon, Sun, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TitleBarProps {
  alwaysOnTop: boolean;
  theme: "light" | "dark";
  opacity: number;
  onToggleAlwaysOnTop: () => void;
  onToggleTheme: () => void;
  onOpacityChange: (opacity: number) => void;
  onClose: () => void;
}

function OpacitySlider({
  value,
  onChange,
  onClose,
}: {
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-8 right-0 z-50 flex w-36 items-center gap-2 rounded-md border border-border bg-background p-2 shadow-md"
    >
      <input
        type="range"
        min={30}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1 w-full cursor-pointer accent-primary"
      />
      <span className="w-8 text-right text-[10px] text-muted-foreground">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

export function TitleBar({
  alwaysOnTop,
  theme,
  opacity,
  onToggleAlwaysOnTop,
  onToggleTheme,
  onOpacityChange,
  onClose,
}: TitleBarProps) {
  const [showOpacity, setShowOpacity] = useState(false);

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/80 px-2 backdrop-blur-sm"
    >
      <div data-tauri-drag-region className="flex-1 select-none pl-1">
        <span data-tauri-drag-region className="text-xs font-medium text-muted-foreground">
          Pinote
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <div className="relative">
          <button
            onClick={() => setShowOpacity(!showOpacity)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              showOpacity && "bg-accent text-accent-foreground",
            )}
          >
            <Circle size={13} />
          </button>
          {showOpacity && (
            <OpacitySlider
              value={opacity}
              onChange={onOpacityChange}
              onClose={() => setShowOpacity(false)}
            />
          )}
        </div>

        <button
          onClick={onToggleTheme}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button
          onClick={onToggleAlwaysOnTop}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            alwaysOnTop ? "text-primary" : "text-muted-foreground",
          )}
        >
          {alwaysOnTop ? <Pin size={13} /> : <PinOff size={13} />}
        </button>

        <button
          onClick={onClose}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
            "text-muted-foreground hover:bg-destructive hover:text-white",
          )}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
