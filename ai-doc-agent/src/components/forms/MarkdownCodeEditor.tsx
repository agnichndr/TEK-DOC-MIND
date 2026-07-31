"use client";

import { useEffect, useRef, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";

const EDITOR_THEME = "tek-doc-vscode-dark";

export function MarkdownCodeEditor({
  ariaInvalid = false,
  maxLength,
  onChange,
  value,
}: {
  ariaInvalid?: boolean;
  maxLength: number;
  onChange: (value: string) => void;
  value: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let active = true;
    let editor: MonacoEditor.IStandaloneCodeEditor | null = null;
    let changeSubscription: { dispose: () => void } | null = null;

    void Promise.all([
      import("monaco-editor/editor/editor.api.js"),
      import("monaco-editor/languages/definitions/markdown/register.js"),
    ])
      .then(([monaco]) => {
        if (!active || !containerRef.current) return;

        monaco.editor.defineTheme(EDITOR_THEME, {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "keyword.md", foreground: "C586C0", fontStyle: "bold" },
            { token: "string.link.md", foreground: "4FC1FF" },
            { token: "variable.md", foreground: "9CDCFE" },
          ],
          colors: {
            "editor.background": "#181818",
            "editor.foreground": "#D4D4D4",
            "editor.lineHighlightBackground": "#222222",
            "editor.selectionBackground": "#3A3D41",
            "editor.inactiveSelectionBackground": "#303033",
            "editorCursor.foreground": "#FFFFFF",
            "editorLineNumber.foreground": "#858585",
            "editorLineNumber.activeForeground": "#C6C6C6",
            "editorIndentGuide.background1": "#333333",
            "editorIndentGuide.activeBackground1": "#555555",
            "editorGutter.background": "#181818",
          },
        });

        editor = monaco.editor.create(containerRef.current, {
          accessibilitySupport: "auto",
          ariaLabel: "Skills Markdown editor",
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          folding: true,
          fontFamily:
            "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
          fontLigatures: true,
          fontSize: 13,
          formatOnPaste: true,
          language: "markdown",
          lineHeight: 21,
          lineNumbers: "on",
          minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
          padding: { bottom: 18, top: 18 },
          renderLineHighlight: "all",
          renderWhitespace: "selection",
          roundedSelection: false,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          theme: EDITOR_THEME,
          value: initialValueRef.current,
          wordWrap: "on",
          wrappingIndent: "indent",
        });
        editorRef.current = editor;
        changeSubscription = editor.onDidChangeModelContent(() => {
          if (!editor) return;
          const nextValue = editor.getValue();
          if (nextValue.length > maxLength) {
            const model = editor.getModel();
            if (model) {
              editor.executeEdits("skills-markdown-length-limit", [
                {
                  forceMoveMarkers: true,
                  range: model.getFullModelRange(),
                  text: nextValue.slice(0, maxLength),
                },
              ]);
            }
            return;
          }
          onChangeRef.current(nextValue);
        });
        setStatus("ready");
        editor.focus();
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
      changeSubscription?.dispose();
      editor?.dispose();
      editorRef.current = null;
    };
  }, [maxLength]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === value) return;
    editor.setValue(value);
  }, [value]);

  if (status === "error") {
    return (
      <textarea
        aria-label="Skills Markdown"
        aria-invalid={ariaInvalid}
        className="agent-markdown-input"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={value}
      />
    );
  }

  return (
    <div
      className="markdown-code-editor"
      data-invalid={ariaInvalid ? "true" : undefined}
      data-status={status}
    >
      <div className="markdown-code-editor-surface" ref={containerRef} />
      {status === "loading" ? (
        <div className="markdown-code-editor-loading" role="status">
          Loading Markdown editor…
        </div>
      ) : null}
    </div>
  );
}
