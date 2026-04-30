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
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, search, searchKeymap, SearchQuery, selectMatches, setSearchQuery } from "@codemirror/search";
import { bracketMatching, defaultHighlightStyle, foldAll as foldAllCommand, foldGutter, indentOnInput, syntaxHighlighting, unfoldAll as unfoldAllCommand } from "@codemirror/language";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { forEachDiagnostic, lintGutter, lintKeymap, linter, setDiagnostics } from "@codemirror/lint";
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

const jsonLintSource = jsonParseLinter();

const DEFAULT_SEARCH_MESSAGES = {
  find: "fieldTools.json.searchFind",
  next: "fieldTools.json.searchNext",
  previous: "fieldTools.json.searchPrevious",
  all: "fieldTools.json.searchAll",
  close: "fieldTools.json.searchClose"
};

function searchLabel(messages, key) {
  return String(messages && messages[key] ? messages[key] : DEFAULT_SEARCH_MESSAGES[key]);
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "cm-button";
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.addEventListener("click", onClick);
  return button;
}

function createSearchOnlyPanel(messages = {}) {
  return (view) => {
    const dom = document.createElement("div");
    dom.className = "cm-search dashboard-cm-search";

    const input = document.createElement("input");
    input.className = "cm-textfield";
    input.name = "search";
    input.setAttribute("form", "");
    input.setAttribute("main-field", "true");
    const findLabel = searchLabel(messages, "find");
    input.placeholder = findLabel;
    input.setAttribute("aria-label", findLabel);
    input.setAttribute("title", findLabel);
    input.value = getSearchQuery(view.state).search;

    const commit = () => {
      const current = getSearchQuery(view.state);
      const next = new SearchQuery({
        search: input.value,
        caseSensitive: current.caseSensitive,
        literal: current.literal,
        regexp: current.regexp,
        wholeWord: current.wholeWord
      });
      if (!next.eq(current)) {
        view.dispatch({ effects: setSearchQuery.of(next) });
      }
    };

    input.addEventListener("change", commit);
    input.addEventListener("keyup", commit);
    dom.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
        (event.shiftKey ? findPrevious : findNext)(view);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSearchPanel(view);
      }
    });

    dom.append(
      input,
      createButton(searchLabel(messages, "next"), () => {
        commit();
        findNext(view);
      }),
      createButton(searchLabel(messages, "previous"), () => {
        commit();
        findPrevious(view);
      }),
      createButton(searchLabel(messages, "all"), () => {
        commit();
        selectMatches(view);
      }),
      createButton(searchLabel(messages, "close"), () => {
        closeSearchPanel(view);
      })
    );

    return {
      top: true,
      dom,
      mount() {
        input.focus();
        input.select();
      },
      update(update) {
        const current = getSearchQuery(update.state);
        if (input !== view.root.activeElement && input.value !== current.search) {
          input.value = current.search;
        }
      }
    };
  };
}

function collectDiagnostics(state) {
  const diagnostics = [];
  forEachDiagnostic(state, (diagnostic, from, to) => {
    diagnostics.push({
      from,
      to,
      severity: diagnostic.severity,
      source: diagnostic.source || "json",
      message: diagnostic.message
    });
  });
  return diagnostics.sort((left, right) => left.from - right.from || left.to - right.to);
}

function computeJsonDiagnostics(view) {
  return jsonLintSource(view).map((diagnostic) => ({
    from: diagnostic.from,
    to: diagnostic.to,
    severity: diagnostic.severity,
    source: diagnostic.source || "json",
    message: diagnostic.message
  })).sort((left, right) => left.from - right.from || left.to - right.to);
}

function refreshJsonDiagnostics(view) {
  const diagnostics = computeJsonDiagnostics(view);
  view.dispatch(setDiagnostics(view.state, diagnostics));
  return collectDiagnostics(view.state);
}

function replaceDocument(view, nextValue) {
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: String(nextValue ?? "")
    }
  });
}

export function createJsonEditor(options = {}) {
  const parent = options.parent;
  if (!parent) {
    throw new Error("A parent element is required to mount the dashboard JSON editor.");
  }

  const onChange = options.onChange;
  const onSave = options.onSave;
  const searchMessages = options.searchMessages || {};

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
      search({ top: true, createPanel: createSearchOnlyPanel(searchMessages) }),
      lintGutter(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      json(),
      linter(jsonLintSource, { delay: 300 }),
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
        ...lintKeymap,
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
      replaceDocument(view, nextValue);
    },
    validateJson() {
      return refreshJsonDiagnostics(view);
    },
    getFirstDiagnostic() {
      return refreshJsonDiagnostics(view)[0] || null;
    },
    jumpToFirstError() {
      const diagnostic = refreshJsonDiagnostics(view)[0] || null;
      if (!diagnostic) {
        return null;
      }
      const docLength = view.state.doc.length;
      const from = Math.max(0, Math.min(diagnostic.from, docLength));
      const to = Math.max(from, Math.min(diagnostic.to, docLength));
      view.dispatch({
        selection: { anchor: from, head: to },
        effects: EditorView.scrollIntoView(from, { y: "center" })
      });
      view.focus();
      return diagnostic;
    },
    formatJson() {
      const formatted = JSON.stringify(JSON.parse(view.state.doc.toString()), null, 2);
      replaceDocument(view, formatted);
      refreshJsonDiagnostics(view);
      return formatted;
    },
    minifyJson() {
      const minified = JSON.stringify(JSON.parse(view.state.doc.toString()));
      replaceDocument(view, minified);
      refreshJsonDiagnostics(view);
      return minified;
    },
    foldAll() {
      return foldAllCommand(view);
    },
    unfoldAll() {
      return unfoldAllCommand(view);
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
