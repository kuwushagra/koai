
import { useEffect, useRef, useState } from "react";

import {
  EditorView,
  basicSetup,
} from "codemirror";

import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

import { EditorState, StateEffect } from "@codemirror/state";

import {
  syntaxHighlighting,
  HighlightStyle,
  defaultHighlightStyle,
  LanguageDescription,
} from "@codemirror/language";

import { languages } from "@codemirror/language-data";
import { tags } from "@lezer/highlight";

import { themes } from "../../themes/themes";

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#AF00DB" },
  { tag: tags.controlKeyword, color: "#AF00DB" },
  { tag: tags.operator, color: "#000000" },
  { tag: tags.string, color: "#A31515" },
  { tag: tags.special(tags.string), color: "#A31515" },
  { tag: tags.number, color: "#098658" },
  { tag: tags.bool, color: "#0000FF" },
  { tag: tags.null, color: "#0000FF" },
  { tag: tags.comment, color: "#008000" },
  { tag: tags.lineComment, color: "#008000" },
  { tag: tags.blockComment, color: "#008000" },
  { tag: tags.function(tags.variableName), color: "#795E26" },
  { tag: tags.definition(tags.variableName), color: "#001080" },
  { tag: tags.typeName, color: "#267F99" },
  { tag: tags.className, color: "#267F99" },
  { tag: tags.propertyName, color: "#001080" },
  { tag: tags.punctuation, color: "#404040" },
  { tag: tags.self, color: "#AF00DB" },
  { tag: tags.atom, color: "#0000FF" },
  { tag: tags.meta, color: "#795E26" },
  { tag: tags.heading, color: "#267F99", fontWeight: "bold" },
  { tag: tags.link, color: "#0000EE", textDecoration: "underline" },
]);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#C586C0" },
  { tag: tags.controlKeyword, color: "#C586C0" },
  { tag: tags.operator, color: "#D4D4D4" },
  { tag: tags.string, color: "#CE9178" },
  { tag: tags.special(tags.string), color: "#CE9178" },
  { tag: tags.number, color: "#B5CEA8" },
  { tag: tags.bool, color: "#569CD6" },
  { tag: tags.null, color: "#569CD6" },
  { tag: tags.comment, color: "#6A9955" },
  { tag: tags.lineComment, color: "#6A9955" },
  { tag: tags.blockComment, color: "#6A9955" },
  { tag: tags.function(tags.variableName), color: "#DCDCAA" },
  { tag: tags.definition(tags.variableName), color: "#9CDCFE" },
  { tag: tags.typeName, color: "#4EC9B0" },
  { tag: tags.className, color: "#4EC9B0" },
  { tag: tags.propertyName, color: "#9CDCFE" },
  { tag: tags.punctuation, color: "#D4D4D4" },
  { tag: tags.self, color: "#569CD6" },
  { tag: tags.atom, color: "#569CD6" },
  { tag: tags.meta, color: "#D7BA7D" },
  { tag: tags.heading, color: "#4EC9B0", fontWeight: "bold" },
  { tag: tags.link, color: "#3794FF", textDecoration: "underline" },
]);

interface SearchNavigation {
  query: string;
  line?: number;
  requestId: number;
}

interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  theme?: string;
  searchNavigation?: SearchNavigation | null;
}

function getLanguageDescription(
  language: string
): LanguageDescription | undefined {
  const normalized = language
    .toLowerCase()
    .trim()
    .replace(/^\./, "");

  if (!normalized) return undefined;

  const aliases: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    htm: "html",
    md: "markdown",
    mdx: "markdown",
    yml: "yaml",
    h: "c",
    cxx: "cpp",
    cc: "cpp",
    hpp: "cpp",
    hxx: "cpp",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    rb: "ruby",
    golang: "go",
    rs: "rust",
    kt: "kotlin",
    kts: "kotlin",
    cs: "csharp",
    dockerfile: "docker",
    makefile: "make",
    mk: "make",
    txt: "plaintext",
  };

  const name = aliases[normalized] ?? normalized;

  return (
    LanguageDescription.matchLanguageName(languages, name, true) ??
    languages.find((description) =>
      description.extensions?.some(
        (extension) => extension.toLowerCase() === normalized
      )
    )
  );
}

function getEditorTheme(themeName: string) {
  const selectedTheme = themes[themeName] ?? themes.dark;
  const variables = selectedTheme.variables;

  const getColor = (name: string, fallback: string) =>
    (variables[name as keyof typeof variables] as string) ?? fallback;

  const background = getColor("--editor-bg", "#181818");
  const foreground = getColor("--text", "#eeeeee");
  const surface = getColor("--surface", background);
  const border = getColor("--border", "#303030");
  const muted = getColor("--text-muted", "#858585");
  const accent = getColor("--accent", "#a78bfa");

  return EditorView.theme(
    {
      "&": {
        height: "100%",
        width: "100%",
        backgroundColor: background,
        color: foreground,
      },

      ".cm-content": {
        caretColor: accent,
      },

      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: accent,
      },

      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: `${accent}55`,
      },

      ".cm-activeLine": {
        backgroundColor: `${accent}12`,
      },

      ".cm-gutters": {
        backgroundColor: surface,
        color: muted,
        borderRight: `1px solid ${border}`,
      },

      ".cm-activeLineGutter": {
        backgroundColor: `${accent}20`,
        color: foreground,
      },

      ".cm-foldPlaceholder": {
        backgroundColor: surface,
        border: "none",
        color: muted,
      },

      ".cm-tooltip": {
        backgroundColor: surface,
        color: foreground,
        border: `1px solid ${border}`,
      },

      ".cm-tooltip-autocomplete": {
        "& > ul > li[aria-selected]": {
          backgroundColor: `${accent}30`,
          color: foreground,
        },
      },
    },
    { dark: !selectedTheme.light }
  );
}

function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  theme = "dark",
  searchNavigation = null,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const [editorReady, setEditorReady] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    const description = getLanguageDescription(language);
    const selectedTheme = themes[theme] ?? themes.dark;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        getEditorTheme(theme),
        syntaxHighlighting(
          selectedTheme.light
            ? lightHighlightStyle
            : darkHighlightStyle
        ),
        syntaxHighlighting(defaultHighlightStyle, {
          fallback: true,
        }),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: container,
    });

    editorViewRef.current = view;
    setEditorReady((previous) => previous + 1);

    if (description) {
      description.load()
        .then((support) => {
          if (cancelled || editorViewRef.current !== view) return;

          view.dispatch({
            effects: StateEffect.appendConfig.of(support),
          });
        })
        .catch((error) => {
          console.error(
            `[KOAI] Failed to load language: ${language}`,
            error
          );
        });
    } else {
      console.warn(`[KOAI] Unsupported language: ${language}`);
    }

    return () => {
      cancelled = true;
      view.destroy();
      editorViewRef.current = null;
    };
  }, [language, readOnly, theme]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();

    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view || !searchNavigation) return;

    const { query, line } = searchNavigation;

    if (!query.trim()) return;

    const doc = view.state.doc;

    let from = -1;

    if (line && line >= 1 && line <= doc.lines) {
      const targetLine = doc.line(line);

      const index = targetLine.text
        .toLowerCase()
        .indexOf(query.toLowerCase());

      if (index !== -1) {
        from = targetLine.from + index;
      }
    }

    if (from === -1) {
      from = doc.toString()
        .toLowerCase()
        .indexOf(query.toLowerCase());
    }

    if (from === -1) return;

    const to = from + query.length;

    view.dispatch({
      selection: {
        anchor: from,
        head: to,
      },
      effects: EditorView.scrollIntoView(from, {
        y: "center",
      }),
    });

    view.focus();
  }, [searchNavigation, editorReady, value]);

  return (
    <div
      ref={containerRef}
      className="codemirror-container"
    />
  );
}

export default CodeEditor;