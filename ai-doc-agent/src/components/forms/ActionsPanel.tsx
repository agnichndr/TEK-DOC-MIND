"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowIcon,
  CheckIcon,
  DocumentIcon,
  LayersIcon,
  XIcon,
} from "@/components/ui/Icons";
import type { ProjectDocumentAction } from "@/types/projectAction";

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

export function ActionsPanel({
  actions,
  onNavigateGroups,
}: {
  actions: ProjectDocumentAction[];
  onNavigateGroups: () => void;
}) {
  const [repositoryGroupIds, setRepositoryGroupIds] = useState<string[]>([]);
  const [pipelineIds, setPipelineIds] = useState<string[]>([]);

  const repositoryGroupOptions = useMemo(
    () =>
      Array.from(
        new Map(
          actions.map((action) => [
            action.repositoryGroupId,
            action.repositoryGroupName,
          ]),
        ),
      )
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([value, label]) => ({ value, label })),
    [actions],
  );
  const pipelineOptions = useMemo(
    () =>
      Array.from(
        new Map(
          actions.map((action) => [action.pipelineId, action.pipelineName]),
        ),
      )
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([value, label]) => ({ value, label })),
    [actions],
  );
  const visibleActions = actions.filter(
    (action) =>
      (!repositoryGroupIds.length ||
        repositoryGroupIds.includes(action.repositoryGroupId)) &&
      (!pipelineIds.length || pipelineIds.includes(action.pipelineId)),
  );
  const filtered = repositoryGroupIds.length > 0 || pipelineIds.length > 0;

  return (
    <section className="repository-list-section actions-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Document workflow queue</p>
          <h2>Actions</h2>
        </div>
        {actions.length ? (
          <span className="actions-count">
            {visibleActions.length} of {actions.length} actions
          </span>
        ) : null}
      </div>
      <p className="form-intro">
        Each action maps repository context to a pipeline for document creation.
      </p>

      {actions.length ? (
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
                  onClick={() => {
                    setRepositoryGroupIds([]);
                    setPipelineIds([]);
                  }}
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
                onChange={setRepositoryGroupIds}
                options={repositoryGroupOptions}
                selectedValues={repositoryGroupIds}
              />
            </div>
            <div className="field-group">
              <span className="field-label">Pipeline</span>
              <MultiSelectFilter
                allLabel="All pipelines"
                ariaLabel="Filter actions by pipeline"
                onChange={setPipelineIds}
                options={pipelineOptions}
                selectedValues={pipelineIds}
              />
            </div>
          </aside>

          <div className="actions-results">
            {visibleActions.length ? (
              <div className="module-table-wrap actions-table-wrap">
                <table className="module-table actions-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Repository group</th>
                      <th>Pipeline</th>
                      <th>State</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleActions.map((action) => (
                      <tr key={action.id}>
                        <td>
                          <div className="action-identity">
                            <DocumentIcon height={16} width={16} />
                            <span>
                              <strong>{action.actionType}</strong>
                              <small>{actionReference(action.id)}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="action-resource-name">
                            <LayersIcon height={14} width={14} />
                            {action.repositoryGroupName}
                          </span>
                        </td>
                        <td>{action.pipelineName}</td>
                        <td>
                          <span className="action-state action-state-new">
                            {action.state}
                          </span>
                        </td>
                        <td className="action-created-at">
                          {formatCreatedAt(action.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="repository-empty actions-filter-empty">
                <h3>No actions match these filters</h3>
                <p>Choose another repository group or pipeline.</p>
                <button
                  className="empty-add-button"
                  onClick={() => {
                    setRepositoryGroupIds([]);
                    setPipelineIds([]);
                  }}
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
