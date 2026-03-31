import path from "path"
import { fileURLToPath } from "url"

import { build } from "esbuild"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.resolve(__dirname, "..")
const outFile = path.join(pluginRoot, "public", "js", "vendor", "codemirror-json.js")

const source = `
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "#f7f2e7",
    backgroundColor: "rgba(6, 8, 12, 0.88)",
    borderRadius: "18px"
  },
  ".cm-scroller": {
    overflow: "auto",
    minHeight: "100%"
  },
  ".cm-gutters": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    color: "rgba(247, 242, 231, 0.56)",
    borderRight: "1px solid rgba(255, 255, 255, 0.08)"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.04)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.05)"
  },
  ".cm-foldGutter .cm-gutterElement": {
    paddingLeft: "4px"
  },
  ".cm-content": {
    caretColor: "#f0aa45",
    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
    fontSize: "0.96rem"
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#f0aa45"
  },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgba(240, 170, 69, 0.24) !important"
  },
  ".cm-tooltip": {
    backgroundColor: "#11161f",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "14px"
  },
  ".cm-panels": {
    backgroundColor: "rgba(10, 12, 18, 0.96)",
    color: "#f7f2e7",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
  },
  ".cm-search": {
    padding: "10px"
  },
  ".cm-search input": {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#f7f2e7",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "10px",
    padding: "6px 8px"
  },
  ".cm-search button": {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: "#f7f2e7",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "10px",
    padding: "6px 10px"
  }
});

const saveKeyBinding = (onSave) => ({
  key: "Mod-s",
  preventDefault: true,
  run() {
    if (typeof onSave === "function") {
      onSave();
    }
    return true;
  }
});

const searchKeyBinding = {
  key: "Mod-f",
  preventDefault: true,
  run(view) {
    openSearchPanel(view);
    return true;
  }
};

export function createJsonEditor(options = {}) {
  const parent = options.parent;
  if (!parent) {
    throw new Error("A parent element is required to mount the dashboard JSON editor.");
  }

  const onChange = options.onChange;
  const onSave = options.onSave;

  const state = EditorState.create({
    doc: String(options.value ?? ""),
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      drawSelection(),
      highlightActiveLine(),
      history(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      search({ top: true }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      json(),
      editorTheme,
      EditorState.tabSize.of(2),
      keymap.of([
        saveKeyBinding(onSave),
        searchKeyBinding,
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && typeof onChange === "function") {
          onChange(update.state.doc.toString());
        }
      })
    ]
  });

  const view = new EditorView({
    state,
    parent
  });

  return {
    view,
    focus() {
      view.focus();
    },
    getValue() {
      return view.state.doc.toString();
    },
    setValue(nextValue) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: String(nextValue ?? "")
        }
      });
    },
    openSearch() {
      openSearchPanel(view);
    },
    destroy() {
      view.destroy();
    }
  };
}

window.DashboardCodeMirrorJson = {
  createJsonEditor
};
`

await build({
  stdin: {
    contents: source,
    resolveDir: pluginRoot,
    sourcefile: "dashboard-codemirror-entry.js",
    loader: "js"
  },
  bundle: true,
  outfile: outFile,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none",
  logLevel: "info"
})
