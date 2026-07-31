"use client";

import {
  CardViewIcon,
  SearchIcon,
  TableViewIcon,
  XIcon,
} from "@/components/ui/Icons";

export type ModuleListView = "cards" | "table";

export function ModuleListControls({
  itemLabel,
  onQueryChange,
  onViewChange,
  query,
  resultCount,
  view,
}: {
  itemLabel: string;
  onQueryChange: (query: string) => void;
  onViewChange: (view: ModuleListView) => void;
  query: string;
  resultCount: number;
  view: ModuleListView;
}) {
  return (
    <div className="module-list-controls">
      <label className="module-search">
        <span className="sr-only">Search {itemLabel}</span>
        <SearchIcon width={15} height={15} />
        <input
          aria-label={`Search ${itemLabel}`}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`Search ${itemLabel}…`}
          type="search"
          value={query}
        />
        {query ? (
          <button
            aria-label={`Clear ${itemLabel} search`}
            onClick={() => onQueryChange("")}
            type="button"
          >
            <XIcon width={13} height={13} />
          </button>
        ) : null}
      </label>
      <span className="module-result-count" aria-live="polite">
        {resultCount} {resultCount === 1 ? "result" : "results"}
      </span>
      <div className="module-view-toggle" role="group" aria-label="List view">
        <button
          aria-label="Card view"
          aria-pressed={view === "cards"}
          className={view === "cards" ? "active" : ""}
          onClick={() => onViewChange("cards")}
          type="button"
        >
          <CardViewIcon width={14} height={14} />
          <span>Cards</span>
        </button>
        <button
          aria-label="Table view"
          aria-pressed={view === "table"}
          className={view === "table" ? "active" : ""}
          onClick={() => onViewChange("table")}
          type="button"
        >
          <TableViewIcon width={14} height={14} />
          <span>Table</span>
        </button>
      </div>
    </div>
  );
}
