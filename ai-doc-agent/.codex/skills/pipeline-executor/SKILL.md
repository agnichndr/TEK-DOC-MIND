---
description: Guidance for implementing the pipeline executor and keeping pipeline documentation aligned with the builder and runtime behavior.
---

# Pipeline Executor Skill

Use this skill whenever you are implementing, extending, or debugging the execution path for a pipeline-based document action in TEK-DOC-MIND.

## Primary Purpose

The pipeline executor is the runtime layer that turns a validated pipeline definition into an action run. Its job is to:
- load a saved pipeline and its associated action,
- resolve the project-scoped repository context,
- evaluate the workflow graph in dependency order,
- invoke the required agents with the right inputs,
- assemble the requested output artifacts,
- update action state and logs,
- and preserve a clear record of how builder capabilities map to executor behavior.

This skill is the main guide for making the runtime consistent with the pipeline contract documented in Pipeline.MD.

## When to Use This Skill

Apply this skill when you are changing any of the following:
- pipeline execution flow,
- action state transitions,
- node dependency ordering or fan-in/fan-out behavior,
- agent invocation or runtime context composition,
- output assembly rules,
- persistence of run artifacts or statuses,
- pipeline validation rules that affect execution,
- or the builder/runtime contract documented in Pipeline.MD.

## Core Execution Model

Treat the pipeline as a validated workflow contract, not as a UI draft.

### 1. Use the saved pipeline as the source of truth
- Execution must work from a stable, persisted snapshot of the pipeline.
- Avoid relying on unsaved editor state or transient client-side graph data.
- If a pipeline changes after an action is queued, the executor should follow the documented policy for immutability or versioning.

### 2. Preserve the builder/executor separation
The builder and executor have different responsibilities:
- The builder defines structure, topology, node inputs, output mappings, and layout.
- The executor consumes that structure to run the workflow and produce artifacts.

When a feature changes in one layer, verify whether the other layer must also change.

### 3. Respect the DAG model
The current runtime should assume:
- exactly one source node,
- one or more agent nodes,
- directed workflow edges,
- acyclic topology,
- and source-reachable execution paths.

If a new capability introduces conditions, loops, or non-DAG behavior, update both the runtime design and the documentation.

## Execution Lifecycle

A pipeline action should follow this lifecycle:

1. Load action and pipeline snapshot
   - Resolve the action record.
   - Load the pipeline definition and its normalized nodes and edges.
   - Ensure the referenced project, agent, connector, repository group, and media resources are still valid.

2. Validate execution readiness
   - Confirm the graph is still structurally valid.
   - Confirm the referenced agents, connectors, and models are still available.
   - Confirm the action is currently eligible to run.

3. Build an execution plan
   - Derive a deterministic topological order for nodes.
   - Ensure fan-in nodes wait for all required upstream outputs.
   - Keep independent nodes eligible for parallel execution where appropriate.

4. Resolve runtime context
   - Attach repository context from the selected repository group.
   - Attach upstream node outputs in the documented order.
   - Attach node media inputs and project uploads.
   - Prepare the agent instructions, skills, and runtime metadata.

5. Execute each node
   - Run the source node to establish initial context.
   - Run each downstream agent node once all dependencies are satisfied.
   - Record intermediate results and errors at the node level.

6. Assemble output artifacts
   - Read each output target’s ordered contributors.
   - Apply optional contributor headers.
   - Produce the declared output type or mark it as unsupported if the runtime does not yet implement that format.

7. Persist final status and artifacts
   - Update the action state.
   - Save logs, outputs, and metadata.
   - Preserve enough state for retries, inspection, and debugging.

## Runtime Contract Rules

### Source node behavior
- The source node is a placeholder for repository context and project-scoped inputs.
- It should not be treated as a normal agent node.
- Its execution should resolve the repository context that later nodes depend on.

### Agent node behavior
- Each agent node should execute with:
  - resolved upstream outputs,
  - relevant media inputs,
  - project-scoped agent configuration,
  - and execution metadata.
- Agent output should be captured per node so downstream nodes can consume it.

### Output target behavior
- Output targets are assembly definitions, not workflow dependencies.
- The executor should respect the contributor ordering and headers recorded in the pipeline contract.
- Output assembly should not implicitly infer ordering from layout or node position.

## State and Failure Handling

The executor should follow a clear state model and avoid silent success.

Recommended state progression:
- NEW
- QUEUED
- RUNNING
- SUCCEEDED
- PARTIAL
- FAILED
- CANCELLED

When a node or whole action fails:
- preserve the error context,
- record partial outputs where possible,
- avoid leaking secrets or internal credentials,
- and keep the action state explicit.

## Security and Safety Requirements

The executor must remain server-side and security-first.

- Never trust the browser-provided pipeline or project identity.
- Derive project scope from the verified server-side session.
- Keep connector credentials and other secrets server-only.
- Never place raw secrets into logs, pipeline YAML, or action artifacts.
- Revalidate project ownership and resource access before execution.
- Ensure that media URLs, agent references, and connectors are still project-owned before use.

## Implementation Guidance

When implementing the executor, keep the work aligned with the current architecture:
- use server-side services for execution logic,
- keep route handlers and actions thin,
- validate all runtime inputs with the existing Zod schemas,
- use the pipeline service layer for persistence and orchestration,
- and preserve project isolation through the same secured RPC and RLS model used by the builder.

## Documentation Maintenance Rules

This skill must keep Pipeline.MD synchronized with the actual system.

Whenever you change the pipeline builder, pipeline executor, action lifecycle, validation rules, output assembly, or execution semantics, update Pipeline.MD in the same change.

### Update Pipeline.MD when:
- the builder gains or removes node capabilities,
- workflow edges or graph rules change,
- output mapping behavior changes,
- action state progression changes,
- executor behavior becomes more complete or more constrained,
- YAML or persistence contracts change,
- security or project-isolation rules change,
- or the documented gap between builder and execution is reduced.

### Keep the documentation truthful
- Distinguish clearly between what is implemented today and what is still planned.
- Do not document future behavior as if it already exists.
- Keep the doc focused on the current contract, current limits, and the intended direction.

### Preferred maintenance pattern
When making a pipeline-related change:
1. update the runtime implementation,
2. update the relevant builder/executor docs,
3. update Pipeline.MD with the new contract or limitation,
4. and keep this skill aligned with the same decisions.

## Practical Checklist

Before considering a pipeline-related change complete, verify:
- the executor still matches the pipeline schema,
- the graph rules still match the documented DAG contract,
- action states are updated consistently,
- output assembly behavior is still documented,
- security boundaries remain enforced,
- and Pipeline.MD reflects the current builder/runtime reality.

## Summary

The executor should be built as a disciplined, server-side runtime for the validated pipeline graph. It must be secure, deterministic, observable, and documented. Every meaningful change to the builder or execution model should be reflected in Pipeline.MD so the repository remains a reliable source of truth for both workflow design and workflow execution.
