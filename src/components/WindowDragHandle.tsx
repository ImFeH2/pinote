import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type KeyboardEvent,
  type MouseEventHandler,
  useId,
  useRef,
  useState,
} from "react";
import { logError } from "@/lib/logger";

const MOVE_OFFSETS = new Map<string, readonly [number, number]>([
  ["ArrowLeft", [-10, 0]],
  ["ArrowRight", [10, 0]],
  ["ArrowUp", [0, -10]],
  ["ArrowDown", [0, 10]],
]);

export function WindowDragHandle({
  onMouseDown,
}: {
  onMouseDown: MouseEventHandler<HTMLButtonElement>;
}) {
  const [moving, setMoving] = useState(false);
  const instructionsId = useId();
  const moveQueue = useRef(Promise.resolve());

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && moving) {
      event.preventDefault();
      event.stopPropagation();
      setMoving(false);
      return;
    }
    const offset = MOVE_OFFSETS.get(event.key);
    if (!moving || !offset) return;
    event.preventDefault();
    event.stopPropagation();
    moveQueue.current = moveQueue.current
      .then(async () => {
        const appWindow = getCurrentWindow();
        const position = await appWindow.outerPosition();
        await appWindow.setPosition(
          new PhysicalPosition(position.x + offset[0], position.y + offset[1]),
        );
      })
      .catch((error) => {
        logError("note-window", "move_window_by_keyboard_failed", error);
      });
  };

  return (
    <>
      <button
        type="button"
        aria-label="Move window"
        aria-describedby={instructionsId}
        aria-pressed={moving}
        onMouseDown={(event) => {
          setMoving(false);
          onMouseDown(event);
        }}
        onClick={(event) => {
          if (event.detail === 0) setMoving((value) => !value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setMoving(false)}
        className="absolute left-0 right-0 top-0 z-20 h-1.5 cursor-grab border-0 bg-transparent p-0 outline-none aria-pressed:bg-primary/20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      />
      <span id={instructionsId} className="sr-only">
        Press Enter or Space to start moving. Use arrow keys to move. Press
        Enter, Space, or Escape to finish.
      </span>
    </>
  );
}
