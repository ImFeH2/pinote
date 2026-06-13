import {
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  Editor as MilkdownEditorCore,
  rootCtx,
} from "@milkdown/kit/core";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { indent } from "@milkdown/kit/plugin/indent";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { nord } from "@milkdown/theme-nord";
import { type CSSProperties, useCallback, useEffect, useRef } from "react";
import "@milkdown/theme-nord/style.css";

interface EditorInnerProps {
  defaultValue: string;
  readOnly: boolean;
  onChange: (markdown: string) => void;
}

function EditorInner({ defaultValue, readOnly, onChange }: EditorInnerProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const [loading, getInstance] = useInstance();

  useEditor(
    (root) =>
      MilkdownEditorCore.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, defaultValue);
          ctx.update(editorViewOptionsCtx, (prev) => {
            return {
              ...prev,
              editable: () => !readOnly,
            };
          });
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChangeRef.current(markdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(indent)
        .use(trailing),
    [],
  );

  useEffect(() => {
    if (loading) return;
    const editor = getInstance();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.setProps({
        editable: () => !readOnly,
      });
    });
  }, [getInstance, loading, readOnly]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;
      if (loading) return;
      const editor = getInstance();
      if (!editor) return;

      const target = e.target as HTMLElement;
      if (target.closest(".ProseMirror")) return;

      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const editorDom = view.dom as HTMLElement;
        const contentBottom = editorDom.getBoundingClientRect().bottom;
        const clickY = e.clientY;

        if (clickY <= contentBottom) return;

        const lineHeight = parseFloat(getComputedStyle(editorDom).lineHeight) || 20;
        const linesToAdd = Math.max(1, Math.ceil((clickY - contentBottom) / lineHeight));

        const { state, dispatch } = view;
        const { schema } = state;
        let tr = state.tr;

        for (let i = 0; i < linesToAdd; i++) {
          tr = tr.insert(tr.doc.content.size, schema.nodes.paragraph.create());
        }

        const newEndPos = tr.doc.content.size - 1;
        tr = tr.setSelection(TextSelection.create(tr.doc, newEndPos));
        dispatch(tr);
        view.focus();
      });
    },
    [getInstance, loading, readOnly],
  );

  return (
    <div className="mx-1 flex min-h-0 flex-1 cursor-text flex-col" onClick={handleContainerClick}>
      <Milkdown />
    </div>
  );
}

interface EditorProps {
  defaultValue: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
  style?: CSSProperties;
}

export function Editor({
  defaultValue,
  onChange,
  readOnly = false,
  initialScrollTop = 0,
  onScrollTopChange,
  style,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!onScrollTopChange) return;
      onScrollTopChange(event.currentTarget.scrollTop);
    },
    [onScrollTopChange],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nextScrollTop = Math.max(0, initialScrollTop);
    const apply = () => {
      container.scrollTop = nextScrollTop;
    };
    apply();
    const frame = window.requestAnimationFrame(apply);
    const timer = window.setTimeout(apply, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [defaultValue, initialScrollTop]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="milkdown-editor pinote-scrollbar min-h-0 flex-1"
      style={style}
    >
      <MilkdownProvider>
        <EditorInner defaultValue={defaultValue} readOnly={readOnly} onChange={onChange} />
      </MilkdownProvider>
    </div>
  );
}
