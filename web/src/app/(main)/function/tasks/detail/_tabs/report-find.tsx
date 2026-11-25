import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const highlightName = "superartex-report-match";
const blockSelector = "p, li, pre, blockquote, th, td, h1, h2, h3, h4, h5, h6";
const hiddenSelector = '[hidden], [aria-hidden="true"], .sr-only';

type TextBlock = { element: Element; text: string; segments: { node: Text; start: number }[] };
type Match = { block: TextBlock; start: number; end: number };

function indexPreview(preview: HTMLElement) {
  const blocks: TextBlock[] = [];
  const walker = preview.ownerDocument.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!node.length || !parent || parent.closest(hiddenSelector)) continue;
    const element = parent.closest(blockSelector) ?? preview.firstElementChild ?? preview;
    let block = blocks.at(-1);
    if (!block || block.element !== element) {
      block = { element, text: "", segments: [] };
      blocks.push(block);
    }
    block.segments.push({ node, start: block.text.length });
    block.text += node.data;
  }
  return blocks;
}

function findMatches(blocks: TextBlock[], query: string) {
  const words = query.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(words.join("\\s+"), "giu");
  const matches: Match[] = [];
  for (const block of blocks) {
    for (const match of block.text.matchAll(pattern)) {
      matches.push({ block, start: match.index, end: match.index + match[0].length });
    }
  }
  return matches;
}

function revealMatch(preview: HTMLElement, { block, start, end }: Match) {
  const first = block.segments.findLast((segment) => segment.start <= start);
  const last = block.segments.findLast((segment) => segment.start < end);
  if (!first || !last || !preview.contains(block.element)) return;

  const range = preview.ownerDocument.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);

  const innerScroll = first.node.parentElement?.closest<HTMLElement>("pre, [data-report-table-scroll]");
  if (innerScroll) scrollToMatch(innerScroll, range);
  scrollToMatch(preview, range);

  const registry = typeof CSS === "undefined" ? undefined : CSS.highlights;
  if (registry && typeof Highlight !== "undefined") {
    registry.set(highlightName, new Highlight(range));
    return () => registry.delete(highlightName);
  }

  block.element.setAttribute("data-report-match", "");
  return () => block.element.removeAttribute("data-report-match");
}

function scrollToMatch(container: HTMLElement, range: Range) {
  const match = range.getClientRects()[0];
  if (!match) return;

  const bounds = container.getBoundingClientRect();
  const top = bounds.top + container.clientTop;
  const left = bounds.left + container.clientLeft;
  const bottom = top + container.clientHeight;
  const right = left + container.clientWidth;
  if (match.top < top) container.scrollTop += match.top - top - 4;
  else if (match.bottom > bottom) container.scrollTop += match.bottom - bottom + 4;
  if (match.left < left) container.scrollLeft += match.left - left - 4;
  else if (match.right > right) container.scrollLeft += match.right - right + 4;
}

export function ReportFind({
  preview,
  previewId,
  report,
}: {
  preview: React.RefObject<HTMLElement | null>;
  previewId: string;
  report: string;
}) {
  const queryId = React.useId();
  const [query, setQuery] = React.useState("");
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [index, setIndex] = React.useState(0);
  const indexed = React.useRef<{ report: string; blocks: TextBlock[] } | null>(null);
  const term = query.trim();

  React.useLayoutEffect(() => {
    if (indexed.current?.report !== report) indexed.current = null;
    const container = preview.current;
    if (!term || !container) {
      setMatches((current) => (current.length ? [] : current));
    } else {
      indexed.current ??= { report, blocks: indexPreview(container) };
      setMatches(findMatches(indexed.current.blocks, term));
    }
    setIndex(0);
  }, [preview, report, term]);

  const match = matches[index];
  React.useLayoutEffect(() => {
    const container = preview.current;
    if (container && match) return revealMatch(container, match);
  }, [match, preview]);

  function moveMatch(step: number) {
    if (matches.length < 2) return;
    setIndex((current) => (current + step + matches.length) % matches.length);
  }

  const status = term
    ? matches.length
      ? `${index + 1} of ${matches.length} ${matches.length === 1 ? "match" : "matches"}`
      : "No matches"
    : "";

  return (
    <search aria-label="Report preview" className="mb-3 flex flex-wrap items-center gap-2">
      <label htmlFor={queryId} className="font-medium text-sm">
        Find in report
      </label>
      <Input
        id={queryId}
        type="search"
        autoComplete="off"
        autoCorrect="off"
        maxLength={256}
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          moveMatch(event.shiftKey ? -1 : 1);
        }}
        className="w-56 min-w-0 max-w-full"
        aria-controls={previewId}
      />
      <Button type="button" size="sm" variant="outline" disabled={matches.length < 2} onClick={() => moveMatch(-1)}>
        Previous match
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={matches.length < 2} onClick={() => moveMatch(1)}>
        Next match
      </Button>
      <output className="text-muted-foreground text-sm" aria-live="polite">
        {status}
      </output>
    </search>
  );
}
