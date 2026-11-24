import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Field } from "./ui";
export type Appearance = {
  theme: "dark" | "light" | "system";
  text: "standard" | "large";
};
const key = "entre-nos:appearance:v1";
export function readAppearance(): Appearance {
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? "{}");
    return {
      theme: ["dark", "light", "system"].includes(p.theme) ? p.theme : "dark",
      text: p.text === "large" ? "large" : "standard",
    };
  } catch {
    return { theme: "dark", text: "standard" };
  }
}
export function applyAppearance(p: Appearance) {
  const light =
    p.theme === "light" ||
    (p.theme === "system" &&
      window.matchMedia?.("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
  document.documentElement.dataset.textSize = p.text;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", light ? "#f3f6fa" : "#17212b");
}
const Context = createContext<{
  value: Appearance;
  change: (value: Appearance) => void;
} | null>(null);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(readAppearance);
  useEffect(() => {
    applyAppearance(value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Browser preferences may block storage. */
    }
    const query = window.matchMedia?.("(prefers-color-scheme: light)");
    const update = () => applyAppearance(value);
    query?.addEventListener("change", update);
    return () => query?.removeEventListener("change", update);
  }, [value]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty(
        "--viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      document.documentElement.dataset.compactViewport = String(
        (viewport?.height ?? window.innerHeight) < 540,
      );
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("dialog[open]"))
        active.scrollIntoView({ block: "nearest" });
    };
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <Context.Provider value={{ value, change: setValue }}>
      {children}
    </Context.Provider>
  );
}
export default function AppearanceSettings() {
  const context = useContext(Context);
  if (!context) return null;
  const { value, change } = context;
  return (
    <section className="appearance-settings" aria-label="Aparência e leitura">
      <h3>Aparência e leitura</h3>
      <p>Escolha o que fica mais confortável neste aparelho.</p>
      <div className="preference-grid">
        <Field label="Tema do aplicativo">
          <select
            value={value.theme}
            onChange={(e) =>
              change({ ...value, theme: e.target.value as Appearance["theme"] })
            }
          >
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
            <option value="system">Seguir o sistema</option>
          </select>
        </Field>
        <Field label="Tamanho do texto">
          <select
            value={value.text}
            onChange={(e) =>
              change({ ...value, text: e.target.value as Appearance["text"] })
            }
          >
            <option value="standard">Padrão</option>
            <option value="large">Maior</option>
          </select>
        </Field>
      </div>
      <small>
        O zoom do navegador continua disponível. Só estas preferências são
        guardadas no aparelho.
      </small>
    </section>
  );
}
