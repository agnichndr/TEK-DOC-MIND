'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type TourPlacement = 'top' | 'bottom' | 'left' | 'right';

type TourStep = {
  key: string;
  selector: string;
  title: string;
  description: string;
  placement: TourPlacement;
};

const steps: TourStep[] = [
  {
    key: 'brand',
    selector: '#tour-brand',
    title: 'Meet the workspace',
    description:
      'The brand mark anchors the experience and keeps the private workspace feeling secure and intentional.',
    placement: 'bottom',
  },
  {
    key: 'hero',
    selector: '#tour-hero',
    title: 'Understand the promise',
    description:
      'This hero section explains how TEK-DOK-MIND turns technical documentation into a faster, more structured workflow.',
    placement: 'right',
  },
  {
    key: 'workspace',
    selector: '#tour-workspace',
    title: 'Open the workspace panel',
    description:
      'Create a new private project or reopen an existing one from this focused workspace hub.',
    placement: 'left',
  },
  {
    key: 'create',
    selector: '#tour-create-form',
    title: 'Start with a secure project',
    description:
      'You can name your workspace, protect it with a password, and move forward with confidence.',
    placement: 'top',
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTourSeenState() {
  if (typeof window === 'undefined') {
    return { seenInSession: false, seenPersistently: false, isAuthenticatedSession: false };
  }

  const hasProjectSessionCookie = document.cookie
    .split('; ')
    .some((entry) => entry.startsWith('tek-dok-project-session='));

  const sessionKey = hasProjectSessionCookie
    ? 'tek-doc-tour-session-seen-authenticated'
    : 'tek-doc-tour-session-seen-guest';
  const persistentKey = hasProjectSessionCookie
    ? 'tek-doc-tour-seen-authenticated'
    : 'tek-doc-tour-seen';

  return {
    seenInSession: window.sessionStorage.getItem(sessionKey) === 'true',
    seenPersistently: window.localStorage.getItem(persistentKey) === 'true',
    isAuthenticatedSession: hasProjectSessionCookie,
  };
}

function markTourSeen() {
  if (typeof window === 'undefined') {
    return;
  }

  const hasProjectSessionCookie = document.cookie
    .split('; ')
    .some((entry) => entry.startsWith('tek-dok-project-session='));
  const sessionKey = hasProjectSessionCookie
    ? 'tek-doc-tour-session-seen-authenticated'
    : 'tek-doc-tour-session-seen-guest';
  const persistentKey = hasProjectSessionCookie
    ? 'tek-doc-tour-seen-authenticated'
    : 'tek-doc-tour-seen';

  window.sessionStorage.setItem(sessionKey, 'true');
  window.localStorage.setItem(persistentKey, 'true');
}

export function ProductTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [hasSeenTour, setHasSeenTour] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const { seenInSession, seenPersistently } = getTourSeenState();
      const shouldShow = !seenInSession && !seenPersistently;

      setHasSeenTour(!shouldShow);

      if (shouldShow) {
        setIsOpen(true);
        setActiveStep(0);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateTarget = () => {
      const currentStep = steps[activeStep];
      const element = document.querySelector(currentStep.selector) as HTMLElement | null;
      if (element) {
        setTargetRect(element.getBoundingClientRect());
        return;
      }

      setTargetRect(null);
    };

    updateTarget();
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, { passive: true });

    return () => {
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget);
    };
  }, [activeStep, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const currentStep = steps[activeStep];

  const spotlightStyle = targetRect
    ? ({
        top: `${targetRect.top}px`,
        left: `${targetRect.left}px`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`,
      }) as CSSProperties
    : undefined;

  const tooltipStyle = useMemo(() => {
    if (!targetRect) {
      return undefined;
    }

    const cardWidth = 320;
    const cardHeight = 210;
    const padding = 18;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = targetRect.top + targetRect.height + 16;
    let left = targetRect.left;

    if (currentStep.placement === 'top') {
      top = targetRect.top - cardHeight - 16;
      left = clamp(targetRect.left, padding, viewportWidth - cardWidth - padding);
    }

    if (currentStep.placement === 'left') {
      top = clamp(targetRect.top, padding, viewportHeight - cardHeight - padding);
      left = clamp(targetRect.left - cardWidth - 16, padding, viewportWidth - cardWidth - padding);
    }

    if (currentStep.placement === 'right') {
      top = clamp(targetRect.top, padding, viewportHeight - cardHeight - padding);
      left = clamp(targetRect.right + 16, padding, viewportWidth - cardWidth - padding);
    }

    if (currentStep.placement === 'bottom') {
      top = clamp(targetRect.bottom + 16, padding, viewportHeight - cardHeight - padding);
      left = clamp(targetRect.left, padding, viewportWidth - cardWidth - padding);
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      maxWidth: `${cardWidth}px`,
    } as CSSProperties;
  }, [currentStep.placement, targetRect]);

  const handleStart = () => {
    const { seenInSession, seenPersistently } = getTourSeenState();
    if (seenInSession || seenPersistently) {
      setHasSeenTour(true);
      return;
    }

    setActiveStep(0);
    setIsOpen(true);
  };

  const handleFinish = () => {
    markTourSeen();
    setHasSeenTour(true);
    setIsOpen(false);
    setActiveStep(0);
  };

  const handleNext = () => {
    if (activeStep < steps.length - 1) {
      setActiveStep((current) => current + 1);
      return;
    }

    handleFinish();
  };

  const handlePrevious = () => {
    if (activeStep > 0) {
      setActiveStep((current) => current - 1);
    }
  };

  return (
    <>
      <button type="button" className="tour-launch-button" onClick={handleStart}>
        {hasSeenTour ? 'Tour completed' : 'Start guided tour'}
      </button>
      {isOpen ? (
        <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Product tour">
          <div className="tour-backdrop" />
          {spotlightStyle ? <div className="tour-spotlight" style={spotlightStyle} /> : null}
          {targetRect ? (
            <div
              className="tour-hotspot"
              style={{
                top: `${targetRect.top + targetRect.height / 2}px`,
                left: `${targetRect.left + targetRect.width / 2}px`,
              }}
            />
          ) : null}
          {tooltipStyle ? (
            <div className="tour-card" style={tooltipStyle}>
              <div className="tour-progress" aria-hidden="true">
                <span style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }} />
              </div>
              <p className="tour-step-count">
                Step {activeStep + 1} / {steps.length}
              </p>
              <h2>{currentStep.title}</h2>
              <p className="tour-copy">{currentStep.description}</p>
              <div className="tour-actions">
                <button type="button" className="tour-secondary" onClick={handleFinish}>
                  Skip
                </button>
                <div className="tour-nav">
                  <button type="button" className="tour-tertiary" onClick={handlePrevious} disabled={activeStep === 0}>
                    Back
                  </button>
                  <button type="button" className="tour-primary" onClick={handleNext}>
                    {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
