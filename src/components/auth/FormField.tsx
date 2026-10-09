import type { ReactNode } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <Field id={id} label={label} hint={hint} error={error} wireAria={false}>
      <div className="relative">
        <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true">
          {icon}
        </span>
        <Input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={errorId}
          className="pl-10"
        />
        {endContent}
      </div>
    </Field>
  );
}
