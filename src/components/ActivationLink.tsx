import { useEffect, useState } from "react";

export function parseActivationFragment(fragment: string) {
  const values = new URLSearchParams(fragment.replace(/^#/, ""));
  const token = values.get("activate") || "";
  const username = values.get("username") || "";
  return /^[a-f0-9]{64}$/.test(token) && /^[a-z0-9_]{3,32}$/.test(username)
    ? { token, username }
    : null;
}

// Fragment is never sent to the web server. Scrub it from the current history
// entry after capture; retain it only in memory until activation or navigation.
export function useActivationLink() {
  const [activation] = useState(() =>
    parseActivationFragment(window.location.hash),
  );
  useEffect(() => {
    if (activation)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, [activation]);
  return activation;
}

export function ActivationNotice() {
  return (
    <p role="status">
      Defina sua senha pessoal para ativar o acesso. O link é de uso único e
      expira em 20 minutos. Não compartilhe este dispositivo durante a ativação.
    </p>
  );
}
