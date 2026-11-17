import {
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            "aria-label": label,
          })
        : children}
    </label>
  );
}
export function Metric({
  label,
  value,
  hint,
  positive = false,
}: {
  label: string;
  value: string;
  hint: string;
  positive?: boolean;
}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong className={positive ? "positive" : ""}>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
