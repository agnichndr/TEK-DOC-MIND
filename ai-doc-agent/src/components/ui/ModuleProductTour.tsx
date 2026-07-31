"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

export type ModuleTourStep = {
  selector: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
};

type ModuleProductTourProps = {
  moduleId: string;
  moduleName: string;
  steps: ModuleTourStep[];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function storageKeys(moduleId: string) {
  return {
    session: `tek-doc-${moduleId}-tour-session-seen-authenticated`,
    persistent: `tek-doc-${moduleId}-tour-seen-authenticated`,
  };
}

function hasSeenTour(moduleId: string) {
  const keys = storageKeys(moduleId);
  return (
    window.sessionStorage.getItem(keys.session) === "true" ||
    window.localStorage.getItem(keys.persistent) === "true"
  );
}

function rememberTour(moduleId: string) {
  const keys = storageKeys(moduleId);
  window.sessionStorage.setItem(keys.session, "true");
  window.localStorage.setItem(keys.persistent, "true");
}

export function ModuleProductTour({
  moduleId,
  moduleName,
  steps,
}: ModuleProductTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const currentStep = steps[activeStep];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!hasSeenTour(moduleId)) {
        setActiveStep(0);
        setIsOpen(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [moduleId]);

  useEffect(() => {
    if (!isOpen || !currentStep) return;

    const updateTarget = () => {
      const element = document.querySelector<HTMLElement>(currentStep.selector);
      if (!element) {
        setTargetRect(null);
        return;
      }

      element.scrollIntoView({ block: "center", behavior: "smooth" });
      setTargetRect(element.getBoundingClientRect());
    };

    const frame = window.requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget);
    };
  }, [currentStep, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const focusFrame = window.requestAnimationFrame(() => cardRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        rememberTour(moduleId);
        setIsOpen(false);
        setActiveStep(0);
      }

      if (event.key === "Tab" && cardRef.current) {
        const controls = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>(
            "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
          ),
        );
        const first = controls[0];
        const last = controls.at(-1);

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [isOpen, moduleId]);

  const tooltipStyle = useMemo(() => {
    if (typeof window === "undefined") return undefined;

    const edge = 12;
    const gap = 16;
    const cardWidth = Math.min(320, window.innerWidth - edge * 2);
    const cardHeight = 238;

    if (!targetRect) {
      return {
        left: "50%",
        top: "50%",
        width: `${cardWidth}px`,
        transform: "translate(-50%, -50%)",
      } satisfies CSSProperties;
    }

    let top = targetRect.bottom + gap;
    let left = targetRect.left;
    const placement = currentStep?.placement ?? "bottom";

    if (placement === "top") {
      top = targetRect.top - cardHeight - gap;
    } else if (placement === "left") {
      top = targetRect.top;
      left = targetRect.left - cardWidth - gap;
    } else if (placement === "right") {
      top = targetRect.top;
      left = targetRect.right + gap;
    }

    return {
      top: `${clamp(top, edge, Math.max(edge, window.innerHeight - cardHeight - edge))}px`,
      left: `${clamp(left, edge, Math.max(edge, window.innerWidth - cardWidth - edge))}px`,
      width: `${cardWidth}px`,
    } satisfies CSSProperties;
  }, [currentStep?.placement, targetRect]);

  if (!steps.length || !currentStep) return null;

  const finish = () => {
    rememberTour(moduleId);
    setIsOpen(false);
    setActiveStep(0);
  };

  const start = (event: MouseEvent<HTMLButtonElement>) => {
    restoreFocusRef.current = event.currentTarget;
    setActiveStep(0);
    setIsOpen(true);
  };

  return (
    <>
      <button className="tour-launch-button" onClick={start} type="button">
        Tour {moduleName}
      </button>
      {isOpen ? (
        <div
          aria-label={`${moduleName} guided tour`}
          aria-modal="true"
          className="tour-layer"
          role="dialog"
        >
          <div className="tour-backdrop" />
          {targetRect ? (
            <>
              <div
                aria-hidden="true"
                className="tour-spotlight"
                style={{
                  height: `${targetRect.height}px`,
                  left: `${targetRect.left}px`,
                  top: `${targetRect.top}px`,
                  width: `${targetRect.width}px`,
                }}
              />
              <div
                aria-hidden="true"
                className="tour-hotspot"
                style={{
                  left: `${targetRect.left + targetRect.width / 2}px`,
                  top: `${targetRect.top + targetRect.height / 2}px`,
                }}
              />
            </>
          ) : null}
          <div
            aria-describedby={`${moduleId}-tour-description`}
            aria-labelledby={`${moduleId}-tour-title`}
            className="tour-card"
            ref={cardRef}
            style={tooltipStyle}
            tabIndex={-1}
          >
            <div className="tour-progress" aria-hidden="true">
              <span style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }} />
            </div>
            <p className="tour-step-count">
              {moduleName} · Step {activeStep + 1} / {steps.length}
            </p>
            <h2 id={`${moduleId}-tour-title`}>{currentStep.title}</h2>
            <p className="tour-copy" id={`${moduleId}-tour-description`}>
              {currentStep.description}
            </p>
            <div className="tour-actions">
              <button className="tour-secondary" onClick={finish} type="button">
                Skip
              </button>
              <div className="tour-nav">
                <button
                  className="tour-tertiary"
                  disabled={activeStep === 0}
                  onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
                  type="button"
                >
                  Back
                </button>
                <button
                  className="tour-primary"
                  onClick={() => {
                    if (activeStep === steps.length - 1) finish();
                    else setActiveStep((step) => step + 1);
                  }}
                  type="button"
                >
                  {activeStep === steps.length - 1 ? "Finish" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
