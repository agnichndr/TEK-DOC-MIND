"use client";

import {
  useActionState,
  useEffect,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  accessProjectAction,
  createProjectAction,
} from "@/actions/projectActions";
import {
  ArrowIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  KeyIcon,
  LockIcon,
  PlusIcon,
  XIcon,
} from "@/components/ui/Icons";
import type {
  CreateProjectActionState,
  ProjectActionState,
} from "@/types/project";

const initialCreateState: CreateProjectActionState = { status: "idle" };
const initialAccessState: ProjectActionState = { status: "idle" };

function Field({
  id,
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="field-group" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        {...props}
        id={id}
        className="field"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

function PasswordField({
  id,
  error,
  label = "Password",
}: {
  id: string;
  error?: string;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="field-group" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="password-wrap">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          className="field field-password"
          placeholder="At least 8 characters"
          minLength={8}
          maxLength={72}
          autoComplete="current-password"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <EyeIcon hidden={visible} />
        </button>
      </span>
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function SubmitButton({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary" type="submit" disabled={pending}>
      <span>{pending ? pendingLabel : children}</span>
      <ArrowIcon />
    </button>
  );
}

function SuccessModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyProjectId() {
    try {
      await navigator.clipboard.writeText(projectId);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="success-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-title"
      >
        <button
          type="button"
          className="dialog-close"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon />
        </button>
        <span className="success-mark">
          <CheckIcon width={24} height={24} />
        </span>
        <p className="eyebrow">Project created</p>
        <h2 id="success-title">Your workspace is ready.</h2>
        <p className="dialog-copy">
          This ID is shown only once. Save it with your password to access the
          project later.
        </p>
        <div className="project-id-box">
          <span>Unique project ID</span>
          <strong>{projectId}</strong>
          <button type="button" onClick={copyProjectId}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy ID"}
          </button>
        </div>
        <div className="security-note">
          <LockIcon />
          <p>
            We store a secure digest of this ID and a bcrypt hash of your
            password—never the original values.
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={onClose}>
          I&apos;ve saved my project ID
        </button>
      </section>
    </div>
  );
}

function CreateForm() {
  const [state, action] = useActionState(
    createProjectAction,
    initialCreateState,
  );
  const [dismissedProjectId, setDismissedProjectId] = useState<string | null>(
    null,
  );
  const projectId = state.status === "success" ? state.result.projectId : null;

  return (
    <>
      <form action={action} className="project-form" noValidate>
        <div className="form-heading">
          <span className="form-icon">
            <PlusIcon />
          </span>
          <div>
            <p className="eyebrow">Start something new</p>
            <h2>Create a project</h2>
          </div>
        </div>
        <p className="form-intro">
          Name your workspace and secure it with a password.
        </p>
        <Field
          id="create-name"
          name="name"
          label="Project name"
          placeholder="e.g. Product launch notes"
          minLength={2}
          maxLength={80}
          autoComplete="off"
          required
          error={state.status === "error" ? state.fields?.name : undefined}
        />
        <label className="field-group" htmlFor="create-description">
          <span className="field-label">
            Description <small>Optional</small>
          </span>
          <textarea
            id="create-description"
            name="description"
            className="field textarea"
            placeholder="A short note about what this project is for..."
            maxLength={500}
            rows={4}
            aria-invalid={
              state.status === "error" && Boolean(state.fields?.description)
            }
          />
          {state.status === "error" && state.fields?.description ? (
            <span className="field-error">{state.fields.description}</span>
          ) : (
            <span className="field-hint">Up to 500 characters</span>
          )}
        </label>
        <PasswordField
          id="create-password"
          label="Create password"
          error={
            state.status === "error" ? state.fields?.password : undefined
          }
        />
        {state.status === "error" ? (
          <p className="form-message" role="alert">
            {state.message}
          </p>
        ) : null}
        <SubmitButton pendingLabel="Creating project...">
          Create project
        </SubmitButton>
        <p className="form-security">
          <LockIcon width={15} height={15} />
          Credentials are hashed before storage
        </p>
      </form>
      {projectId && dismissedProjectId !== projectId ? (
        <SuccessModal
          projectId={projectId}
          onClose={() => setDismissedProjectId(projectId)}
        />
      ) : null}
    </>
  );
}

function AccessForm() {
  const router = useRouter();
  const [state, action] = useActionState(
    accessProjectAction,
    initialAccessState,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.push("/project");
    }
  }, [router, state.status]);

  return (
    <form action={action} className="project-form" noValidate>
      <div className="form-heading">
        <span className="form-icon">
          <KeyIcon />
        </span>
        <div>
          <p className="eyebrow">Welcome back</p>
          <h2>Access a project</h2>
        </div>
      </div>
      <p className="form-intro">
        Enter your project ID and password.
      </p>
      <Field
        id="access-project-id"
        name="projectId"
        label="Project ID"
        placeholder="PRJ-XXXX-XXXX-XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
        required
        error={state.status === "error" ? state.fields?.projectId : undefined}
        hint="Project IDs are not case-sensitive"
      />
      <PasswordField
        id="access-password"
        error={state.status === "error" ? state.fields?.password : undefined}
      />
      {state.status === "error" ? (
        <p className="form-message" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Checking credentials...">
        Access project
      </SubmitButton>
      {state.status === "success" ? (
        <article className="project-result" aria-live="polite">
          <span className="result-status">
            <CheckIcon width={14} height={14} /> Access granted
          </span>
          <h3>Opening {state.project.name}…</h3>
        </article>
      ) : null}
    </form>
  );
}

export function WorkspacePanel() {
  const [activeTab, setActiveTab] = useState<"create" | "access">("create");

  return (
    <section id="tour-workspace-panel" className="workspace-panel" aria-label="TEK-DOK-MIND workspace">
      <div className="panel-tabs" role="tablist" aria-label="Project actions">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "create"}
          className={activeTab === "create" ? "active" : ""}
          onClick={() => setActiveTab("create")}
        >
          Create project
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "access"}
          className={activeTab === "access" ? "active" : ""}
          onClick={() => setActiveTab("access")}
        >
          Access project
        </button>
      </div>
      <div id="tour-create-form" role="tabpanel">
        {activeTab === "create" ? <CreateForm /> : <AccessForm />}
      </div>
    </section>
  );
}
