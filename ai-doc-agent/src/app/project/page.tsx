import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logoutProjectAction } from "@/actions/projectActions";
import { ProjectResources } from "@/components/forms/ProjectResources";
import { LockIcon } from "@/components/ui/Icons";
import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import { listProjectAgents } from "@/services/agentService";
import { getProjectWorkspace } from "@/services/projectService";
import { listProjectRepositories } from "@/services/repositoryService";
import {
  listProjectLlmConnectors,
  listProjectRepositoryGroups,
} from "@/services/projectResourceService";

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

  const [repositories, repositoryGroups, llmConnectors, agents] = await Promise.all([
    listProjectRepositories(sessionToken),
    listProjectRepositoryGroups(sessionToken),
    listProjectLlmConnectors(sessionToken),
    listProjectAgents(sessionToken),
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
        agents={agents}
        connectors={llmConnectors}
        groups={repositoryGroups}
        projectName={project.name}
        repositories={repositories}
      />

      <footer className="project-footer">
        <span>TEK-DOK-MIND / PROJECT WORKSPACE</span>
        <span>SESSION PROTECTED</span>
      </footer>
    </main>
  );
}
