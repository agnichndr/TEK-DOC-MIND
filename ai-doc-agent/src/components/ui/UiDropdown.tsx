"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowIcon, CheckIcon } from "@/components/ui/Icons";

export type UiDropdownOption = {
  value: string;
  label: string;
  meta?: string;
};

export function UiDropdown({
  ariaInvalid = false,
  ariaLabel,
  disabled = false,
  emptyText = "No options available.",
  loading = false,
  loadingText = "Loading options…",
  onChange,
  onOpen,
  options,
  placeholder = "Select an option",
  value,
}: {
  ariaInvalid?: boolean;
  ariaLabel: string;
  disabled?: boolean;
  emptyText?: string;
  loading?: boolean;
  loadingText?: string;
  onChange: (value: string) => void;
  onOpen?: () => void;
  options: UiDropdownOption[];
  placeholder?: string;
  value: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected =
    options.find((option) => option.value === value) ??
    (value ? { value, label: value } : null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.meta, option.value]
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
    <div className="ui-dropdown" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="ui-dropdown-trigger"
        data-invalid={ariaInvalid ? "true" : undefined}
        disabled={disabled}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) setQuery("");
          if (next) onOpen?.();
        }}
        type="button"
      >
        <span>
          <strong>{selected?.label ?? placeholder}</strong>
          {selected?.meta ? <small>{selected.meta}</small> : null}
        </span>
        <ArrowIcon width={13} height={13} />
      </button>
      {open ? (
        <div className="ui-dropdown-menu">
          <label className="ui-dropdown-search">
            <input
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${ariaLabel.toLowerCase()}…`}
              type="search"
              value={query}
            />
          </label>
          {loading ? (
            <p>{loadingText}</p>
          ) : filteredOptions.length ? (
            <div className="ui-dropdown-options" role="listbox">
              {filteredOptions.map((option) => (
                <button
                  aria-selected={option.value === value}
                  className={option.value === value ? "selected" : ""}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  role="option"
                  type="button"
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.meta ? <small>{option.meta}</small> : null}
                  </span>
                  {option.value === value ? (
                    <CheckIcon width={14} height={14} />
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p>{options.length ? "No matching options." : emptyText}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
