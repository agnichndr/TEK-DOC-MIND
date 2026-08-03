import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logoutProjectAction } from "@/actions/projectActions";
import { ProjectResources } from "@/components/forms/ProjectResources";
import { LockIcon } from "@/components/ui/Icons";
import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import { listProjectAgents } from "@/services/agentService";
import { listProjectDocumentActionsPage } from "@/services/projectActionService";
import {
  listProjectPipelines,
  listProjectUploads,
} from "@/services/pipelineService";
import { getProjectWorkspace } from "@/services/projectService";
import { listProjectRepositories } from "@/services/repositoryService";
import {
  listProjectLlmConnectors,
  listProjectRepositoryGroups,
} from "@/services/projectResourceService";

export const maxDuration = 300;

export default async function ProjectPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    redirect("/");
  }

  const project = await getProjectWorkspace(sessionToken);

  if (!project) {
    redirect("/");
  }

  const [
    repositories,
    repositoryGroups,
    llmConnectors,
    agents,
    pipelines,
    uploads,
    actions,
  ] = await Promise.all([
      listProjectRepositories(sessionToken),
      listProjectRepositoryGroups(sessionToken),
      listProjectLlmConnectors(sessionToken),
      listProjectAgents(sessionToken),
      listProjectPipelines(sessionToken),
      listProjectUploads(sessionToken),
      listProjectDocumentActionsPage(sessionToken, {
        page: 1,
        pageSize: 10,
        repositoryGroupIds: [],
        pipelineIds: [],
        sortBy: "createdAt",
        sortDirection: "desc",
      }),
    ]);

  return (
    <main className="project-shell">
      <header className="project-header">
        <a className="brand" href="/project" aria-label="TEK-DOK-MIND project">
          <span className="brand-mark">T/D</span>
          <span>TEK-DOK-MIND</span>
        </a>
        <form action={logoutProjectAction}>
          <button className="project-exit" type="submit">
            <LockIcon width={14} height={14} />
            Lock project
          </button>
        </form>
      </header>

      <section className="project-overview">
        <div className="project-overview-index" aria-hidden="true">
          PROJECT / 01
        </div>
        <div>
          <p className="eyebrow">Project configuration</p>
          <h1>{project.name}</h1>
          {project.description ? <p>{project.description}</p> : null}
        </div>
        <dl>
          <div>
            <dt>Created</dt>
            <dd>{new Date(project.createdAt).toLocaleDateString("en-US")}</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>{repositories.length} repositories</dd>
          </div>
        </dl>
      </section>

      <ProjectResources
        actions={actions}
        agents={agents}
        connectors={llmConnectors}
        groups={repositoryGroups}
        pipelines={pipelines}
        projectId={project.id}
        projectName={project.name}
        repositories={repositories}
        uploads={uploads}
      />

      <footer className="project-footer">
        <span>TEK-DOK-MIND / PROJECT WORKSPACE</span>
        <span>SESSION PROTECTED</span>
      </footer>
    </main>
  );
}
