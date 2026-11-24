import type { KeyboardEvent } from "react";

// Keep keyboard navigation inside the native modal, including its last link.
export function keepDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.matches(":disabled, [inert]") &&
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0,
  );
  const first = controls[0];
  const last = controls.at(-1);
  const active = document.activeElement;
  if (
    !controls.length ||
    !dialog.contains(active) ||
    (event.shiftKey ? active === first : active === last)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
