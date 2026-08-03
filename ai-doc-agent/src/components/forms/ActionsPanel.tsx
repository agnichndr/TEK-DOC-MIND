"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { listProjectDocumentActionsAction } from "@/actions/projectActionActions";

import {
  ArrowIcon,
  CheckIcon,
  DocumentIcon,
  GitHubIcon,
  LayersIcon,
  XIcon,
} from "@/components/ui/Icons";
import { UiDropdown } from "@/components/ui/UiDropdown";
import type {
  ProjectActionPageSize,
  ProjectActionSortColumn,
  ProjectActionSortDirection,
  ProjectDocumentAction,
  ProjectDocumentActionPage,
} from "@/types/projectAction";

type FilterOption = {
  value: string;
  label: string;
};

function MultiSelectFilter({
  allLabel,
  ariaLabel,
  onChange,
  options,
  selectedValues,
}: {
  allLabel: string;
  ariaLabel: string;
  onChange: (values: string[]) => void;
  options: FilterOption[];
  selectedValues: string[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const summary = !selectedLabels.length
    ? allLabel
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels.length} selected`;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  };

  return (
    <div className="ui-dropdown action-multi-select" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="ui-dropdown-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          <strong>{summary}</strong>
          <small>
            {selectedValues.length
              ? `${selectedValues.length} of ${options.length}`
              : `${options.length} available`}
          </small>
        </span>
        <ArrowIcon height={13} width={13} />
      </button>
      {open ? (
        <div className="ui-dropdown-menu action-multi-select-menu">
          <div
            aria-multiselectable="true"
            className="ui-dropdown-options action-multi-select-options"
            role="listbox"
          >
            <button
              aria-selected={!selectedValues.length}
              className={!selectedValues.length ? "selected" : ""}
              onClick={() => onChange([])}
              role="option"
              type="button"
            >
              <span>
                <strong>{allLabel}</strong>
                <small>Do not limit this filter</small>
              </span>
              {!selectedValues.length ? (
                <CheckIcon height={14} width={14} />
              ) : null}
            </button>
            {options.map((option) => {
              const selected = selectedValues.includes(option.value);
              return (
                <button
                  aria-selected={selected}
                  className={selected ? "selected" : ""}
                  key={option.value}
                  onClick={() => toggle(option.value)}
                  role="option"
                  type="button"
                >
                  <span>
                    <strong>{option.label}</strong>
                  </span>
                  {selected ? <CheckIcon height={14} width={14} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function actionReference(id: string) {
  return `ACT-${id.slice(0, 8).toUpperCase()}`;
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const languageChartColors = [
  "#6c5ce7",
  "#17a589",
  "#ef8b36",
  "#3489c9",
  "#d65780",
  "#8b6f47",
];

type LanguageChartSegment = {
  color: string;
  language: string;
  percentage: number;
};

function languageChartSegments(
  languages: ProjectDocumentAction["codeLanguages"],
): LanguageChartSegment[] {
  const visible = languages.slice(0, 5).map((language, index) => ({
    color: languageChartColors[index]!,
    language: language.language,
    percentage: language.percentage,
  }));
  const remainingPercentage = languages
    .slice(5)
    .reduce((total, language) => total + language.percentage, 0);

  if (remainingPercentage > 0) {
    visible.push({
      color: languageChartColors[5]!,
      language: "Other",
      percentage: remainingPercentage,
    });
  }
  return visible;
}

function languageChartGradient(segments: LanguageChartSegment[]) {
  if (!segments.length) return "conic-gradient(#e2e3df 0deg 360deg)";
  let cursor = 0;
  const stops = segments.map((segment) => {
    const start = cursor;
    cursor = Math.min(100, cursor + segment.percentage);
    return `${segment.color} ${start}% ${cursor}%`;
  });
  if (cursor < 100) stops.push(`#e2e3df ${cursor}% 100%`);
  return `conic-gradient(${stops.join(", ")})`;
}

function activeActionId(actions: ProjectDocumentAction[]) {
  return actions.find(
    (action) =>
      action.state === "RUNNING" &&
      ["QUEUED", "RUNNING"].includes(action.repositoryAnalysisState),
  )?.id ?? null;
}

function SortableHeader({
  column,
  direction,
  label,
  onSort,
  sortBy,
}: {
  column: ProjectActionSortColumn;
  direction: ProjectActionSortDirection;
  label: string;
  onSort: (column: ProjectActionSortColumn) => void;
  sortBy: ProjectActionSortColumn;
}) {
  const active = column === sortBy;
  const nextDirection = active && direction === "asc" ? "descending" : "ascending";

  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        aria-label={`Sort ${label} ${nextDirection}`}
        className={`action-sort-button ${active ? "active" : ""}`}
        onClick={() => onSort(column)}
        type="button"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="action-sort-indicator">
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function ActionsPanel({
  initialPage,
  onNavigateGroups,
  onTotalCountChange,
  pipelineOptions,
  refreshKey,
  repositoryGroupOptions,
  totalActionCount,
}: {
  initialPage: ProjectDocumentActionPage;
  onNavigateGroups: () => void;
  onTotalCountChange: (count: number) => void;
  pipelineOptions: FilterOption[];
  refreshKey: number;
  repositoryGroupOptions: FilterOption[];
  totalActionCount: number;
}) {
  const [pageData, setPageData] = useState(initialPage);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState<ProjectActionPageSize>(
    initialPage.pageSize,
  );
  const [sortBy, setSortBy] =
    useState<ProjectActionSortColumn>("createdAt");
  const [sortDirection, setSortDirection] =
    useState<ProjectActionSortDirection>("desc");
  const [repositoryGroupIds, setRepositoryGroupIds] = useState<string[]>([]);
  const [pipelineIds, setPipelineIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const requestIdRef = useRef(0);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(
    () => activeActionId(initialPage.items),
  );

  const loadPage = useCallback(async (background = false) => {
    const requestId = ++requestIdRef.current;
    if (!background) setLoading(true);
    setErrorMessage("");

    const result = await listProjectDocumentActionsAction({
      page,
      pageSize,
      pipelineIds,
      repositoryGroupIds,
      sortBy,
      sortDirection,
    });
    if (requestId !== requestIdRef.current) return;

    if (result.status === "error") {
      setErrorMessage(result.message);
    } else {
      setPageData(result.resource);
      setPage(result.resource.page);
      setExpandedActionId((current) =>
        result.resource.items.some((action) => action.id === current)
          ? current
          : activeActionId(result.resource.items),
      );
      if (!repositoryGroupIds.length && !pipelineIds.length) {
        onTotalCountChange(result.resource.totalCount);
      }
    }

    setLoading(false);
  }, [
    onTotalCountChange,
    page,
    pageSize,
    pipelineIds,
    repositoryGroupIds,
    sortBy,
    sortDirection,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPage, refreshKey]);

  const hasActiveActions = pageData.items.some(
    (action) =>
      action.state === "RUNNING" &&
      ["QUEUED", "RUNNING"].includes(action.repositoryAnalysisState),
  );

  useEffect(() => {
    if (!hasActiveActions) return;
    const interval = window.setInterval(() => void loadPage(true), 2_500);
    return () => window.clearInterval(interval);
  }, [hasActiveActions, loadPage]);

  const filtered = repositoryGroupIds.length > 0 || pipelineIds.length > 0;
  const firstResult = pageData.totalCount
    ? (pageData.page - 1) * pageData.pageSize + 1
    : 0;
  const lastResult = Math.min(
    pageData.page * pageData.pageSize,
    pageData.totalCount,
  );

  const updateRepositoryGroups = (values: string[]) => {
    setPage(1);
    setRepositoryGroupIds(values);
  };

  const updatePipelines = (values: string[]) => {
    setPage(1);
    setPipelineIds(values);
  };

  const clearFilters = () => {
    setPage(1);
    setRepositoryGroupIds([]);
    setPipelineIds([]);
  };

  const sort = (column: ProjectActionSortColumn) => {
    setPage(1);
    if (column === sortBy) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDirection(column === "createdAt" ? "desc" : "asc");
  };

  return (
    <section className="repository-list-section actions-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Document workflow queue</p>
          <h2>Actions</h2>
        </div>
        {totalActionCount ? (
          <span className="actions-count">
            {filtered
              ? `${pageData.totalCount} of ${totalActionCount} actions`
              : `${totalActionCount} actions`}
          </span>
        ) : null}
      </div>
      <p className="form-intro">
        Each action maps repository context to a pipeline for document creation.
      </p>

      {totalActionCount ? (
        <div className="actions-workspace">
          <aside className="actions-filters" aria-label="Action filters">
            <header>
              <div>
                <span className="eyebrow">Narrow results</span>
                <strong>Filters</strong>
              </div>
              {filtered ? (
                <button
                  aria-label="Clear action filters"
                  onClick={clearFilters}
                  type="button"
                >
                  <XIcon height={12} width={12} /> Clear
                </button>
              ) : null}
            </header>
            <div className="field-group">
              <span className="field-label">Repository group</span>
              <MultiSelectFilter
                allLabel="All repository groups"
                ariaLabel="Filter actions by repository group"
                onChange={updateRepositoryGroups}
                options={repositoryGroupOptions}
                selectedValues={repositoryGroupIds}
              />
            </div>
            <div className="field-group">
              <span className="field-label">Pipeline</span>
              <MultiSelectFilter
                allLabel="All pipelines"
                ariaLabel="Filter actions by pipeline"
                onChange={updatePipelines}
                options={pipelineOptions}
                selectedValues={pipelineIds}
              />
            </div>
          </aside>

          <div aria-busy={loading} className="actions-results">
            {errorMessage ? (
              <div className="actions-fetch-error" role="alert">
                <span>{errorMessage}</span>
                <button onClick={() => void loadPage()} type="button">
                  Retry
                </button>
              </div>
            ) : null}
            {pageData.items.length ? (
              <>
                <div className="module-table-wrap actions-table-wrap">
                  <table className="module-table actions-table">
                  <thead>
                    <tr>
                      <SortableHeader column="action" direction={sortDirection} label="Action" onSort={sort} sortBy={sortBy} />
                      <SortableHeader column="repositoryGroup" direction={sortDirection} label="Repository group" onSort={sort} sortBy={sortBy} />
                      <SortableHeader column="pipeline" direction={sortDirection} label="Pipeline" onSort={sort} sortBy={sortBy} />
                      <SortableHeader column="state" direction={sortDirection} label="State" onSort={sort} sortBy={sortBy} />
                      <SortableHeader column="createdAt" direction={sortDirection} label="Created" onSort={sort} sortBy={sortBy} />
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.items.map((action) => {
                      const expanded = expandedActionId === action.id;
                      const analysisRunning = ["QUEUED", "RUNNING"].includes(
                        action.repositoryAnalysisState,
                      );
                      const chartSegments = languageChartSegments(
                        action.codeLanguages,
                      );
                      const chartLabel = chartSegments.length
                        ? chartSegments
                            .map(
                              (segment) =>
                                `${segment.language} ${segment.percentage.toFixed(1)}%`,
                            )
                            .join(", ")
                        : "No recognized source-code languages";
                      const liquidGradientId = `action-liquid-${action.id}`;
                      return (
                      <Fragment key={action.id}>
                      <tr className="action-row">
                        <td>
                          <button
                            aria-expanded={expanded}
                            className="action-identity action-expand-button"
                            onClick={() =>
                              setExpandedActionId(expanded ? null : action.id)
                            }
                            type="button"
                          >
                            <DocumentIcon height={16} width={16} />
                            <span>
                              <strong>{action.actionType}</strong>
                              <small>{actionReference(action.id)}</small>
                            </span>
                            <ArrowIcon height={12} width={12} />
                          </button>
                        </td>
                        <td>
                          <span className="action-resource-name">
                            <LayersIcon height={14} width={14} />
                            {action.repositoryGroupName}
                          </span>
                        </td>
                        <td>{action.pipelineName}</td>
                        <td>
                          <span
                            className={`action-state action-state-${action.state.toLowerCase()}`}
                          >
                            {action.state}
                          </span>
                        </td>
                        <td className="action-created-at">
                          {formatCreatedAt(action.createdAt)}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="action-detail-row" key={`${action.id}:detail`}>
                          <td colSpan={5}>
                            <div className="action-execution-detail">
                              <header>
                                <div>
                                  <span className="eyebrow">Execution · v{action.version}</span>
                                  <strong>{action.pipelineName}</strong>
                                </div>
                                <small>
                                  {action.stage === "PIPELINE_PENDING"
                                    ? "Repository context ready · pipeline execution pending"
                                    : action.stage === "FAILED"
                                      ? "Repository analysis stopped"
                                      : "Building global repository context"}
                                </small>
                              </header>

                              <div
                                aria-label={`Repository analysis execution: ${action.repositoryAnalysisState.toLowerCase()}`}
                                className={`action-execution-canvas action-execution-${action.repositoryAnalysisState.toLowerCase()}`}
                              >
                                <div className="action-canvas-coordinate" aria-hidden="true">
                                  LIVE EXECUTION / 01
                                </div>
                                <article className="action-stage-node action-source-stage">
                                  <span className="action-stage-icon">
                                    <GitHubIcon height={17} width={17} />
                                  </span>
                                  <div>
                                    <small>Repository source</small>
                                    <strong>{action.repositoryGroupName}</strong>
                                    <span>Scoped branches and paths</span>
                                  </div>
                                  <span className="action-stage-check">
                                    <CheckIcon height={13} width={13} />
                                  </span>
                                </article>
                                <div
                                  aria-hidden="true"
                                  className={`action-liquid-connection ${analysisRunning ? "is-flowing" : "is-settled"}`}
                                >
                                  <svg preserveAspectRatio="none" viewBox="0 0 180 90">
                                    <defs>
                                      <linearGradient id={liquidGradientId} x1="0" x2="1">
                                        <stop offset="0" stopColor="#171a21" />
                                        <stop offset="0.42" stopColor="#6c5ce7" />
                                        <stop offset="1" stopColor="#17a589" />
                                      </linearGradient>
                                    </defs>
                                    <path className="action-liquid-track" d="M 0 45 C 48 45, 47 24, 90 45 S 137 66, 180 45" />
                                    <path
                                      className="action-liquid-stream"
                                      d="M 0 45 C 48 45, 47 24, 90 45 S 137 66, 180 45"
                                      stroke={`url(#${liquidGradientId})`}
                                    />
                                    <path className="action-liquid-packets" d="M 0 45 C 48 45, 47 24, 90 45 S 137 66, 180 45" />
                                  </svg>
                                  <span>{analysisRunning ? "Extracting repository" : "Context transferred"}</span>
                                </div>
                                <article
                                  aria-live="polite"
                                  className={`action-stage-node action-analyzer-stage action-analyzer-${action.repositoryAnalysisState.toLowerCase()}`}
                                >
                                  <header className="action-analyzer-header">
                                    <span className="action-stage-icon">
                                      {action.repositoryAnalysisState === "SUCCEEDED" ? (
                                        <CheckIcon height={17} width={17} />
                                      ) : action.repositoryAnalysisState === "FAILED" ? (
                                        <XIcon height={17} width={17} />
                                      ) : (
                                        <span className="action-stage-spinner" aria-hidden="true" />
                                      )}
                                    </span>
                                    <div>
                                      <small>Code analyzer</small>
                                      <strong>
                                        {action.repositoryAnalysisState === "SUCCEEDED"
                                          ? "Repository intelligence ready"
                                          : action.repositoryAnalysisState === "FAILED"
                                            ? "Analysis failed"
                                            : action.repositoryAnalysisState === "QUEUED"
                                              ? "Preparing analysis"
                                              : "Reading repository sources"}
                                      </strong>
                                      <span>
                                        {action.repositoryAnalysisState === "SUCCEEDED"
                                          ? `Global_Context.md · v${action.version}`
                                          : action.repositoryAnalysisState === "FAILED"
                                            ? action.errorMessage ?? "Repository analysis could not be completed."
                                            : "Extracting structure, dependencies, and languages"}
                                      </span>
                                    </div>
                                    <span className="action-analyzer-state">
                                      {action.repositoryAnalysisState === "SUCCEEDED"
                                        ? "Complete"
                                        : action.repositoryAnalysisState === "FAILED"
                                          ? "Stopped"
                                          : "Analyzing"}
                                    </span>
                                  </header>

                                  {action.repositoryAnalysisState === "SUCCEEDED" ? (
                                    <div className="action-analyzer-results">
                                      <section className="action-analyzer-overview">
                                        <span className="eyebrow">Overview</span>
                                        <p>{action.overview}</p>
                                      </section>
                                      <section className="action-code-composition">
                                        <div
                                          aria-label={`Code composition: ${chartLabel}`}
                                          className="action-language-donut"
                                          role="img"
                                          style={{ background: languageChartGradient(chartSegments) }}
                                        >
                                          <span>
                                            <strong>{action.codeLanguages.length}</strong>
                                            <small>languages</small>
                                          </span>
                                        </div>
                                        <div className="action-language-legend">
                                          <span className="eyebrow">Code composition</span>
                                          {chartSegments.length ? (
                                            <ul>
                                              {chartSegments.map((segment) => (
                                                <li key={segment.language}>
                                                  <i style={{ background: segment.color }} />
                                                  <span>{segment.language}</span>
                                                  <strong>{segment.percentage.toFixed(1)}%</strong>
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <p>No recognized source-code files.</p>
                                          )}
                                        </div>
                                      </section>
                                    </div>
                                  ) : null}
                                </article>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    );})}
                  </tbody>
                  </table>
                </div>
                <nav aria-label="Action pagination" className="actions-pagination">
                  <p>
                    Showing {firstResult}–{lastResult} of {pageData.totalCount}
                  </p>
                  <div className="actions-page-size">
                    <span>Rows</span>
                    <UiDropdown
                      ariaLabel="Actions per page"
                      disabled={loading}
                      onChange={(value) => {
                        setPage(1);
                        setPageSize(Number(value) as ProjectActionPageSize);
                      }}
                      options={[
                        { value: "10", label: "10 rows" },
                        { value: "20", label: "20 rows" },
                        { value: "50", label: "50 rows" },
                      ]}
                      value={String(pageSize)}
                    />
                  </div>
                  <div className="actions-page-controls">
                    <button
                      disabled={loading || pageData.page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      type="button"
                    >
                      Previous
                    </button>
                    <span>
                      Page {pageData.page} of {pageData.totalPages}
                    </span>
                    <button
                      disabled={loading || pageData.page >= pageData.totalPages}
                      onClick={() => setPage((current) => current + 1)}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </nav>
              </>
            ) : (
              <div className="repository-empty actions-filter-empty">
                <h3>No actions match these filters</h3>
                <p>Choose another repository group or pipeline.</p>
                <button
                  className="empty-add-button"
                  onClick={clearFilters}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="repository-empty actions-empty">
          <span className="form-icon">
            <DocumentIcon height={21} width={21} />
          </span>
          <h3>No actions yet</h3>
          <p>Create a document from any repository group to add its first action.</p>
          <button
            className="empty-add-button"
            onClick={onNavigateGroups}
            type="button"
          >
            Open repository groups
          </button>
        </div>
      )}
    </section>
  );
}
