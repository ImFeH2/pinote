import { cn } from "@/lib/utils";
import { type NoteHistorySearchResult } from "@/lib/noteHistory";

interface HistorySectionProps {
  historyQuery: string;
  historyLoading: boolean;
  historyResults: NoteHistorySearchResult[];
  historyOpeningPath: string | null;
  historyError: string | null;
  setHistoryQuery: (value: string) => void;
  onOpenHistoryItem: (item: NoteHistorySearchResult) => Promise<void>;
  formatDateTime: (value: string) => string;
}

export function HistorySection({
  historyQuery,
  historyLoading,
  historyResults,
  historyOpeningPath,
  historyError,
  setHistoryQuery,
  onOpenHistoryItem,
  formatDateTime,
}: HistorySectionProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <input
        type="text"
        value={historyQuery}
        onChange={(event) => {
          setHistoryQuery(event.target.value);
        }}
        placeholder="Search by path or note content"
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary"
      />
      <div className="pinote-scrollbar min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background/70">
        {historyLoading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">Searching...</div>
        ) : historyResults.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">No results.</div>
        ) : (
          historyResults.map((item) => {
            const key = `${item.notePath}::${item.windowId}`;
            const opening = historyOpeningPath === item.notePath;
            return (
              <button
                key={key}
                type="button"
                disabled={opening}
                onClick={() => {
                  void onOpenHistoryItem(item);
                }}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-border/70 px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-accent",
                  opening && "cursor-not-allowed opacity-60",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {item.notePath}
                  </div>
                  {item.matchedByContent && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Content
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">{`Last opened: ${formatDateTime(item.lastOpenedAt)}`}</div>
              </button>
            );
          })
        )}
      </div>
      {historyError && <div className="text-xs text-destructive">{historyError}</div>}
    </div>
  );
}
