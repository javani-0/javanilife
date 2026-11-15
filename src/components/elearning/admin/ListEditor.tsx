// Editable list of short lines (course outcomes, requirements): add, edit,
// remove and reorder. Enter in the "add" box adds the line.
import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { moveItem } from "@/lib/elearning/adminHelpers";
import { hintClass, iconButton, inputClass, labelClass, secondaryButton } from "./ui";
import { cn } from "@/lib/utils";

const ListEditor = ({
  label,
  hint,
  placeholder,
  items,
  onChange,
  itemName,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  /** Used in button labels, e.g. "outcome". */
  itemName: string;
}) => {
  const [pending, setPending] = useState("");
  const id = useId();

  const add = () => {
    const value = pending.trim();
    if (!value) return;
    onChange([...items, value]);
    setPending("");
  };

  return (
    <div>
      <p className={labelClass} id={`${id}-label`}>{label}</p>
      {items.length > 0 && (
        <ol className="mb-3 space-y-2" aria-labelledby={`${id}-label`}>
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-5 shrink-0 text-right font-body text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
              <label htmlFor={`${id}-${index}`} className="sr-only">{`${itemName} ${index + 1}`}</label>
              <input
                id={`${id}-${index}`}
                value={item}
                onChange={(event) => onChange(items.map((current, i) => (i === index ? event.target.value : current)))}
                className={inputClass}
              />
              <button type="button" className={iconButton} onClick={() => onChange(moveItem(items, index, -1))} disabled={index === 0} aria-label={`Move ${itemName} ${index + 1} up`}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={iconButton} onClick={() => onChange(moveItem(items, index, 1))} disabled={index === items.length - 1} aria-label={`Move ${itemName} ${index + 1} down`}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={cn(iconButton, "hover:bg-destructive/10 hover:text-destructive")} onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove ${itemName} ${index + 1}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <label htmlFor={`${id}-new`} className="sr-only">{`New ${itemName}`}</label>
        <input
          id={`${id}-new`}
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button type="button" onClick={add} disabled={!pending.trim()} className={cn(secondaryButton, "shrink-0 px-3 py-2")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </button>
      </div>
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
};

export default ListEditor;
