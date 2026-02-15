import { useCallback, useRef } from "react";
import {
  Editor as MilkdownEditorCore,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { TextSelection } from "@milkdown/kit/prose/state";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/theme-nord/style.css";

interface EditorInnerProps {
  defaultValue: string;
  onChange: (markdown: string) => void;
}

function EditorInner({ defaultValue, onChange }: EditorInnerProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [loading, getInstance] = useInstance();

  useEditor(
    (root) =>
      MilkdownEditorCore.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, defaultValue);
          ctx
            .get(listenerCtx)
            .markdownUpdated((_ctx, markdown) => {
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

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
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
    [loading, getInstance],
  );

  return (
    <div
      className="flex min-h-0 flex-1 cursor-text flex-col"
      onClick={handleContainerClick}
    >
      <Milkdown />
    </div>
  );
}

interface EditorProps {
  defaultValue: string;
  onChange: (markdown: string) => void;
}

export function Editor({ defaultValue, onChange }: EditorProps) {
  return (
    <div className="milkdown-editor min-h-0 flex-1">
      <MilkdownProvider>
        <EditorInner defaultValue={defaultValue} onChange={onChange} />
      </MilkdownProvider>
    </div>
  );
}
