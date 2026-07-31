"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "align"],
    details: [...(defaultSchema.attributes?.details ?? []), "open"],
  },
  tagNames: [
    ...new Set([
      ...(defaultSchema.tagNames ?? []),
      "details",
      "div",
      "kbd",
      "span",
      "summary",
    ]),
  ],
};

export function MarkdownViewer({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return (
      <article className="agent-markdown-preview agent-markdown-preview-empty">
        <p>Nothing to preview.</p>
      </article>
    );
  }

  return (
    <article className="agent-markdown-preview">
      <ReactMarkdown
        components={{
          a({ children, href, node: _node, ...props }) {
            void _node;
            const external = /^https?:\/\//i.test(href ?? "");
            return (
              <a
                {...props}
                href={href}
                rel={external ? "noreferrer noopener" : undefined}
                target={external ? "_blank" : undefined}
              >
                {children}
              </a>
            );
          },
        }}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, markdownSchema],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        remarkPlugins={[remarkGfm]}
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
