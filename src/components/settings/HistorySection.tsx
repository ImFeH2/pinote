import {
  defaultValueCtx,
  editorViewOptionsCtx,
  Editor as MilkdownEditorCore,
  rootCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { nord } from "@milkdown/theme-nord";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { NoteHistorySearchResult } from "@/lib/noteHistory";
import { cn } from "@/lib/utils";
import type { EditorFontFamily } from "@/stores/settings";

const PREVIEW_DELAY_MS = 300;
const PREVIEW_HIDE_DELAY_MS = 200;

function resolveEditorFontFamily(value: EditorFontFamily) {
  if (value === "serif") {
    return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
  }
  if (value === "mono") {
    return '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  }
  return "system-ui, -apple-system, sans-serif";
}

interface PreviewState {
  x: number;
  y: number;
  notePath: string;
  content: string;
}

function NotePreview({ markdown }: { markdown: string }) {
  useEditor(
    (root) =>
      MilkdownEditorCore.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, markdown);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => false,
          }));
        })
        .use(commonmark)
        .use(gfm),
    [],
  );
  return <Milkdown />;
}

function splitPath(path: string) {
  const separator = path.includes("\\") ? "\\" : "/";
  const index = path.lastIndexOf(separator);
  if (index < 0) return { dir: "", file: path };
  return { dir: path.slice(0, index + 1), file: path.slice(index + 1) };
}

interface HistorySectionProps {
  historyQuery: string;
  historyLoading: boolean;
  historyResults: NoteHistorySearchResult[];
  historyOpeningPath: string | null;
  historyError: string | null;
  setHistoryQuery: (value: string) => void;
  onOpenHistoryItem: (item: NoteHistorySearchResult) => Promise<void>;
  formatDateTime: (value: string) => string;
  editorFontFamily: EditorFontFamily;
  editorFontSize: number;
  editorLineHeight: number;
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
  editorFontFamily,
  editorFontSize,
  editorLineHeight,
}: HistorySectionProps) {
  const { t } = useTranslation("settings");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewCacheRef = useRef(new Map<string, string>());
  const titleViewportRef = useRef<HTMLDivElement | null>(null);
  const titleTextRef = useRef<HTMLDivElement | null>(null);
  const [titleScrollDistance, setTitleScrollDistance] = useState(0);
  const [titleScrollDuration, setTitleScrollDuration] = useState(0);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const notePath = preview?.notePath;
    if (!notePath) {
      setTitleScrollDistance(0);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const viewport = titleViewportRef.current;
      const text = titleTextRef.current;
      if (!viewport || !text) return;
      const distance = Math.max(0, Math.ceil(text.scrollWidth - viewport.clientWidth));
      const nextDistance = distance > 2 ? distance : 0;
      const nextDuration =
        nextDistance > 0 ? Math.min(18, Math.max(3.6, (nextDistance + 56) / 34)) : 0;
      setTitleScrollDistance(nextDistance);
      setTitleScrollDuration(nextDuration);
    });
    return () => cancelAnimationFrame(raf);
  }, [preview?.notePath]);

  const schedulePreview = (item: NoteHistorySearchResult, x: number, y: number) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      const cached = previewCacheRef.current.get(item.notePath);
      if (cached !== undefined) {
        if (cached) setPreview({ x, y, notePath: item.notePath, content: cached });
        return;
      }
      readTextFile(item.notePath)
        .then((content) => {
          previewCacheRef.current.set(item.notePath, content);
          if (content) setPreview({ x, y, notePath: item.notePath, content });
        })
        .catch(() => {});
    }, PREVIEW_DELAY_MS);
  };

  const cancelPreview = () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setPreview(null), PREVIEW_HIDE_DELAY_MS);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <input
        type="text"
        value={historyQuery}
        onChange={(event) => {
          setHistoryQuery(event.target.value);
        }}
        placeholder={t("history.searchPlaceholder")}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary"
      />
      <div className="pinote-scrollbar min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background/70">
        {historyLoading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("history.searching")}</div>
        ) : historyResults.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("history.noResults")}</div>
        ) : (
          historyResults.map((item) => {
            const key = `${item.notePath}::${item.windowId}`;
            const opening = historyOpeningPath === item.notePath;
            return (
              <button
                key={key}
                type="button"
                disabled={opening}
                onMouseEnter={(event) => {
                  schedulePreview(item, event.clientX, event.clientY);
                }}
                onMouseLeave={cancelPreview}
                onClick={() => {
                  void onOpenHistoryItem(item);
                }}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-border/70 px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-accent",
                  opening && "cursor-not-allowed opacity-60",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-baseline gap-0.5">
                    <span
                      className="min-w-0 truncate text-xs text-muted-foreground/80"
                      title={item.notePath}
                    >
                      {splitPath(item.notePath).dir}
                    </span>
                    <span
                      className="shrink-0 truncate text-xs text-foreground"
                      title={item.notePath}
                    >
                      {splitPath(item.notePath).file}
                    </span>
                  </div>
                  {item.matchedByContent && (
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t("history.contentMatch")}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("history.lastOpened", { date: formatDateTime(item.lastOpenedAt) })}
                </div>
              </button>
            );
          })
        )}
      </div>
      {preview &&
        createPortal(
          <div
            className="fixed z-50"
            style={{ left: preview.x + 14, top: preview.y + 14 }}
            onMouseEnter={() => {
              if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            }}
            onMouseLeave={cancelPreview}
          >
            <div className="max-w-xs overflow-hidden rounded-md border border-border bg-background shadow-lg">
              <div className="border-b border-border/70 px-2.5 py-1.5">
                <div ref={titleViewportRef} className="pinote-menu-title-viewport">
                  <div
                    ref={titleTextRef}
                    className={cn(
                      "pinote-menu-title-text text-[10px] text-muted-foreground",
                      titleScrollDistance > 0 && "pinote-menu-title-text-scroll",
                    )}
                    style={
                      {
                        "--pinote-menu-title-distance": `${titleScrollDistance}px`,
                        "--pinote-menu-title-duration": `${titleScrollDuration}s`,
                      } as CSSProperties
                    }
                  >
                    {preview.notePath}
                  </div>
                </div>
              </div>
              <div
                className="milkdown-editor pinote-scrollbar max-h-48 overflow-y-auto px-2.5 py-2"
                style={
                  {
                    "--editor-font-family": resolveEditorFontFamily(editorFontFamily),
                    "--editor-font-size": `${editorFontSize}px`,
                    "--editor-line-height": editorLineHeight.toString(),
                  } as CSSProperties
                }
              >
                <MilkdownProvider>
                  <NotePreview key={preview.notePath} markdown={preview.content} />
                </MilkdownProvider>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {historyError && <div className="text-xs text-destructive">{historyError}</div>}
    </div>
  );
}
