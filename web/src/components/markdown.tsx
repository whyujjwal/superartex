"use client";

import type { ComponentProps } from "react";

import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
type HeadingTag = (typeof headingTags)[number];
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const headingClasses: Partial<Record<HeadingTag, string>> = {
  h1: "mt-2.5 text-base font-semibold",
  h2: "mt-2 text-sm font-semibold",
  h3: "mt-1.5 text-sm font-medium text-foreground/90",
  h4: "mt-1.5 text-sm font-medium text-foreground/90",
};

function renderHeading(source: HeadingTag, Tag: HeadingTag | "div") {
  return ({ node, ...props }: ComponentProps<"h1"> & ExtraProps) => (
    <Tag className={headingClasses[source]} {...props} />
  );
}

const headingsByFirstLevel = headingTags.map((_, firstIndex) =>
  Object.fromEntries(
    headingTags.map((source, index) => [
      source,
      renderHeading(source, headingTags[Math.min(firstIndex + index, headingTags.length - 1)]),
    ]),
  ),
);

// Tailwind-styled element overrides (no typography plugin in this project, so we
// style each element). `node` is stripped — it's not a valid DOM attribute.
const components: Components = {
  h1: renderHeading("h1", "div"),
  h2: renderHeading("h2", "div"),
  h3: renderHeading("h3", "div"),
  h4: renderHeading("h4", "div"),
  p: ({ node, ...p }) => <p className="leading-relaxed" {...p} />,
  ul: ({ node, ...p }) => <ul className="my-1 list-disc space-y-0.5 pl-5" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-1 list-decimal space-y-0.5 pl-5" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold" {...p} />,
  a: ({ node, ...p }) => (
    <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
  ),
  hr: () => <hr className="my-2 border-border" />,
  blockquote: ({ node, ...p }) => (
    <blockquote className="my-1 border-l-2 border-border pl-2.5 text-muted-foreground" {...p} />
  ),
  pre: ({ node, ...p }) => (
    <pre className="my-1.5 overflow-auto rounded-md bg-muted/70 p-2.5 text-xs leading-relaxed" {...p} />
  ),
  code: ({ node, className, children, ...rest }) => {
    const block = /language-/.test(className || "");
    return block ? (
      <code className={"font-mono text-xs " + (className || "")} {...rest}>
        {children}
      </code>
    ) : (
      <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...rest}>
        {children}
      </code>
    );
  },
  table: ({ node, ...p }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...p} />
    </div>
  ),
  th: ({ node, ...p }) => <th className="border border-border bg-muted/60 px-2 py-1 text-left font-medium" {...p} />,
  td: ({ node, ...p }) => <td className="border border-border px-2 py-1 align-top" {...p} />,
};

const componentsWithImageAltText: Components = {
  ...components,
  // Keep the description without passing the image source to the browser.
  img: ({ alt }) => (alt?.trim() ? <span>{alt}</span> : null),
};

function ReportTable({ node, ...props }: ComponentProps<"table"> & ExtraProps) {
  return (
    <section
      data-report-table-scroll
      className="my-1.5 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
    >
      <table className="w-full border-collapse text-xs" {...props} />
    </section>
  );
}

export function Markdown({
  text,
  allowImages = true,
  firstHeadingLevel,
  reportTableRegions = false,
}: {
  text: string;
  allowImages?: boolean;
  firstHeadingLevel?: HeadingLevel;
  reportTableRegions?: boolean;
}) {
  const elementComponents = allowImages ? components : componentsWithImageAltText;
  const renderComponents = {
    ...elementComponents,
    ...(firstHeadingLevel && headingsByFirstLevel[firstHeadingLevel - 1]),
    ...(reportTableRegions && { table: ReportTable }),
  };
  return (
    <div className="min-w-0 space-y-1.5 text-sm [&>*:first-child]:mt-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
