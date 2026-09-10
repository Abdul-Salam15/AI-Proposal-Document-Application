"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { INTAKE_FIELDS, type IntakeFieldKey } from "@/lib/intake-fields";

type FormState = Record<IntakeFieldKey, string>;

function buildInitialState(salespersonName: string): FormState {
  return INTAKE_FIELDS.reduce((state, field) => {
    state[field.key] = field.key === "salesperson_name" ? salespersonName : "";
    return state;
  }, {} as FormState);
}

export default function IntakeForm({ salespersonName }: { salespersonName: string }) {
  const router = useRouter();
  const [values, setValues] = useState<FormState>(() => buildInitialState(salespersonName));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(key: IntakeFieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to create proposal.");
        setIsSubmitting(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
    >
      {INTAKE_FIELDS.map((field) =>
        field.editable === false ? (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            {field.label}
            <input
              type={field.type}
              value={values[field.key]}
              disabled
              readOnly
              className="border border-rule bg-paper-shade px-3 py-2 text-sm text-ink/60"
            />
            {field.helpText && (
              <span className="text-xs text-ink/50">{field.helpText}</span>
            )}
          </label>
        ) : (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            {field.label}
            {field.type === "textarea" ? (
              <textarea
                required={field.required}
                rows={3}
                value={values[field.key]}
                onChange={(event) => handleChange(field.key, event.target.value)}
                className="border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
              />
            ) : (
              <input
                type={field.type}
                required={field.required}
                value={values[field.key]}
                onChange={(event) => handleChange(field.key, event.target.value)}
                className="border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
              />
            )}
            {field.helpText && (
              <span className="text-xs text-ink/50">{field.helpText}</span>
            )}
          </label>
        )
      )}

      {error && <p className="text-sm text-oxblood">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 w-fit bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isSubmitting ? "Creating…" : "Create proposal"}
      </button>
    </form>
  );
}
