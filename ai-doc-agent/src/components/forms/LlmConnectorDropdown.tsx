"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowIcon, CheckIcon } from "@/components/ui/Icons";
import { LlmProviderLogo } from "@/components/ui/LlmProviderLogo";
import type { LlmConnectorType } from "@/types/llmConnector";

import styles from "./LlmConnectorDropdown.module.css";

export type LlmConnectorDropdownStatus =
  | "connected"
  | "checking"
  | "connection_error";

type LlmConnectorDropdownOption = {
  value: LlmConnectorType;
  label: string;
  meta?: string;
  status: LlmConnectorDropdownStatus;
};

const statusLabels: Record<LlmConnectorDropdownStatus, string> = {
  connected: "Connected",
  checking: "Checking…",
  connection_error: "Error in Connection",
};

export function LlmConnectorDropdown({
  ariaInvalid = false,
  onChange,
  options,
  value,
}: {
  ariaInvalid?: boolean;
  onChange: (value: LlmConnectorType) => void;
  options: LlmConnectorDropdownOption[];
  value: LlmConnectorType;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.meta, statusLabels[option.status]]
          .filter(Boolean)
          .some((text) =>
            text?.toLocaleLowerCase().includes(normalizedQuery),
          ),
      )
    : options;

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

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="LLM connector"
        className={styles.trigger}
        data-invalid={ariaInvalid ? "true" : undefined}
        onClick={() => {
          setOpen((current) => !current);
          if (open) setQuery("");
        }}
        type="button"
      >
        {selected ? (
          <>
            <span className={styles.logo}>
              <LlmProviderLogo connector={selected.value} />
            </span>
            <span className={styles.content}>
              <strong>{selected.label}</strong>
              {selected.meta ? <small>{selected.meta}</small> : null}
            </span>
            <span className={styles.trailing}>
              <span className={styles.status} data-status={selected.status}>
                {statusLabels[selected.status]}
              </span>
              <ArrowIcon className={styles.chevron} height={13} width={13} />
            </span>
          </>
        ) : null}
      </button>

      {open ? (
        <div className={styles.menu}>
          <label className={styles.search}>
            <input
              aria-label="Search LLM connectors"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search LLM connectors…"
              type="search"
              value={query}
            />
          </label>
          {filteredOptions.length ? (
            <div className={styles.options} role="listbox">
              {filteredOptions.map((option) => (
                <button
                  aria-selected={option.value === value}
                  className={styles.option}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  role="option"
                  type="button"
                >
                  <span className={styles.logo}>
                    <LlmProviderLogo connector={option.value} />
                  </span>
                  <span className={styles.content}>
                    <strong>{option.label}</strong>
                    {option.meta ? <small>{option.meta}</small> : null}
                  </span>
                  <span className={styles.trailing}>
                    <span className={styles.status} data-status={option.status}>
                      {statusLabels[option.status]}
                    </span>
                    {option.value === value ? (
                      <CheckIcon height={14} width={14} />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No matching connectors.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
