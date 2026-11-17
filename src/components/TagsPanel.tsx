import { useRef, useState, type FormEvent } from "react";
import type { State } from "../domain/finance";
import { managedTags, type ManagedTag } from "../domain/import";
import type { Command } from "../data/store";
import { Field } from "./ui";
export default function TagsPanel({
  state,
  ownerId,
  busy,
  onCommand,
}: {
  state: State;
  ownerId: string;
  busy: boolean;
  onCommand: (
    type: Command["type"],
    payload: Record<string, unknown>,
    key?: string,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<ManagedTag | null | undefined>(
      undefined,
    ),
    [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const tags = managedTags(state, ownerId);
  function open(tag: ManagedTag | null) {
    setEditing(tag);
    setError("");
    key.current = crypto.randomUUID();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name || name.length > 40) {
      setError("Informe uma etiqueta com até 40 caracteres.");
      return;
    }
    const saved = await onCommand(
      "tag" as Command["type"],
      {
        id:
          editing && !editing.id.startsWith("legacy:")
            ? editing.id
            : key.current,
        old_name: editing?.name,
        version: editing?.version ?? 0,
        name,
        active: data.get("active") === "on",
      },
      key.current,
    );
    if (saved) setEditing(undefined);
  }
  return (
    <section className="panel">
      <h2>Minhas etiquetas</h2>
      <p>
        Etiquetas identificam temas ou beneficiários e são independentes das
        categorias. Renomear atualiza seus lançamentos e preserva as alterações
        na auditoria. Desativar mantém o histórico.
      </p>
      <button className="secondary" onClick={() => open(null)}>
        Criar etiqueta
      </button>
      {tags.length ? (
        <ul className="list">
          {tags.map((tag) => (
            <li key={tag.id}>
              {tag.name} · {tag.active ? "Ativa" : "Desativada"} ·{" "}
              {
                state.entries.filter(
                  (e) => e.owner_id === ownerId && e.tags?.includes(tag.name),
                ).length
              }{" "}
              lançamentos{" "}
              <button className="secondary" onClick={() => open(tag)}>
                Editar etiqueta
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">
          Crie uma etiqueta ou informe-a ao registrar uma despesa.
        </p>
      )}
      {editing !== undefined && (
        <form key={editing?.id ?? "new"} onSubmit={(e) => void submit(e)}>
          <Field label="Nome da etiqueta">
            <input
              name="name"
              required
              maxLength={40}
              defaultValue={editing?.name ?? ""}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              name="active"
              defaultChecked={editing?.active ?? true}
            />
            Etiqueta ativa para novos lançamentos
          </label>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy}>Salvar etiqueta</button>
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(undefined)}
          >
            Cancelar
          </button>
        </form>
      )}
    </section>
  );
}
