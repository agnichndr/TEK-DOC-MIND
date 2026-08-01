"use client";

import { useMemo, useState } from "react";

import { DocumentIcon, LayersIcon, XIcon } from "@/components/ui/Icons";
import { UiDropdown } from "@/components/ui/UiDropdown";
import type { ProjectDocumentAction } from "@/types/projectAction";

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
  const [repositoryGroupId, setRepositoryGroupId] = useState("all");
  const [pipelineId, setPipelineId] = useState("all");

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
        .map(([value, label]) => ({ value, label, meta: "Repository group" })),
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
        .map(([value, label]) => ({ value, label, meta: "Pipeline" })),
    [actions],
  );
  const visibleActions = actions.filter(
    (action) =>
      (repositoryGroupId === "all" ||
        action.repositoryGroupId === repositoryGroupId) &&
      (pipelineId === "all" || action.pipelineId === pipelineId),
  );
  const filtered = repositoryGroupId !== "all" || pipelineId !== "all";

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
                    setRepositoryGroupId("all");
                    setPipelineId("all");
                  }}
                  type="button"
                >
                  <XIcon height={12} width={12} /> Clear
                </button>
              ) : null}
            </header>
            <div className="field-group">
              <span className="field-label">Repository group</span>
              <UiDropdown
                ariaLabel="Filter actions by repository group"
                onChange={setRepositoryGroupId}
                options={[
                  { value: "all", label: "All repository groups" },
                  ...repositoryGroupOptions,
                ]}
                value={repositoryGroupId}
              />
            </div>
            <div className="field-group">
              <span className="field-label">Pipeline</span>
              <UiDropdown
                ariaLabel="Filter actions by pipeline"
                onChange={setPipelineId}
                options={[
                  { value: "all", label: "All pipelines" },
                  ...pipelineOptions,
                ]}
                value={pipelineId}
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
                    setRepositoryGroupId("all");
                    setPipelineId("all");
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
