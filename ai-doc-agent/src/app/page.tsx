import { WorkspacePanel } from "@/components/forms/WorkspacePanel";
import { LockIcon } from "@/components/ui/Icons";
import { ProductTour } from "@/components/ui/ProductTour";

export default function Home() {
  return (
    <main className="theme-shell">
      <header className="site-header">
        <a id="tour-brand" className="brand" href="#" aria-label="TEK-DOK-MIND home">
          <span className="brand-mark">T/D</span>
          <span>TEK-DOK-MIND</span>
        </a>
        <span className="header-security">
          <LockIcon width={14} height={14} />
          Private workspace
        </span>
      </header>

      <section id="tour-hero" className="hero">
        <div className="hero-copy">
          <div className="hero-index" aria-hidden="true">
            01
          </div>
          <p className="eyebrow">TEK-DOK-MIND</p>
          <h1>
            Your Ultimate
            <br />
            <span>AI Agent</span>
            <br />
            for Technical
            <br />
            Documentation
          </h1>
          <p className="hero-description">
            Smarter technical docs, from first draft to final handoff.
          </p>
          <div className="hero-actions">
            <ProductTour />
          </div>
        </div>
        <div id="tour-workspace">
          <WorkspacePanel />
        </div>
      </section>

      <footer className="site-footer">
        <span>TEK-DOK-MIND / 2026</span>
        <span>Technical docs. Reimagined.</span>
      </footer>
    </main>
  );
}
