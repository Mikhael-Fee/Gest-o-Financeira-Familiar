import { useState } from "react";
import type { Identity } from "../data/store";
import { today, type Account, type State } from "../domain/finance";
import { Field } from "./ui";
type Props = {
  user: Identity;
  state: State;
  accounts: Account[];
  categories: string[];
  house: boolean;
};
export default function ExpenseFields({
  user,
  state,
  accounts,
  categories,
  house,
}: Props) {
  const [method, setMethod] = useState(
    accounts.length
      ? accounts[0].kind === "VA" || accounts[0].kind === "VR"
        ? accounts[0].kind
        : "pix"
      : state.cards.length
        ? "credit"
        : "pix",
  );
  const [card, setCard] = useState(state.cards[0]?.id ?? ""),
    [category, setCategory] = useState(categories[0] ?? "Outros");
  const credit = method === "credit",
    benefit = method === "VA" || method === "VR";
  const sources = accounts.filter((a) =>
    benefit ? a.kind === method : ["bank", "cash"].includes(a.kind),
  );
  const chosen = state.cards.find((c) => c.id === card);
  const consumers =
    chosen?.owner_id === user.id
      ? state.profiles.filter(
          (p) => p.id === user.id || chosen.authorized.includes(p.id),
        )
      : state.profiles.filter((p) => p.id === user.id);
  const responsible = state.profiles.filter(
    (p) => p.id === user.id || (credit && p.id === chosen?.owner_id),
  );
  return (
    <>
      <Field label="Valor (R$)">
        <input
          name="amount"
          className="money-input"
          required
          inputMode="decimal"
          placeholder="0,00"
          pattern="[0-9]+([,.][0-9]{1,2})?"
        />
      </Field>
      <Field label="Descrição / apelido">
        <input
          name="description"
          required
          maxLength={120}
          placeholder="Ex.: mercado da semana"
          autoComplete="off"
        />
      </Field>
      <Field label="Categoria">
        <select
          name="category"
          value={benefit ? "Alimentação" : category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {(benefit ? ["Alimentação"] : categories).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Forma de pagamento">
        <select
          name="payment_method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="pix">Pix</option>
          <option value="debit">Débito</option>
          <option value="cash">Dinheiro</option>
          <option value="credit">Cartão de crédito</option>
          <option value="boleto">Boleto</option>
          <option value="transfer">Transferência</option>
          {accounts.some((a) => a.kind === "VA") && (
            <option value="VA">Vale-alimentação (VA)</option>
          )}
          {accounts.some((a) => a.kind === "VR") && (
            <option value="VR">Vale-refeição (VR)</option>
          )}
          <option value="other">Outro</option>
        </select>
      </Field>
      {credit ? (
        <Field label="Cartão utilizado">
          <select
            name="card"
            value={card}
            onChange={(e) => setCard(e.target.value)}
            required
          >
            <option value="">Selecione um cartão autorizado</option>
            {state.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Conta utilizada">
          <select
            name="account"
            key={method}
            required
            defaultValue={sources[0]?.id ?? ""}
          >
            <option value="" disabled>
              Selecione sua conta
            </option>
            {sources.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {benefit && (
        <p className="form-help">
          VA/VR é usado em alimentação e permanece separado do seu dinheiro.
        </p>
      )}
      {credit && (
        <p className="form-help">
          A compra entra na fatura. Nenhum dinheiro sai da conta agora.
        </p>
      )}
      <Field label="Data da compra">
        <input
          name="date"
          type="date"
          required
          defaultValue={today()}
          max={today()}
        />
      </Field>
      <label className="checkbox">
        <input name="house" type="checkbox" defaultChecked={house} />
        Esta despesa é da Casa
      </label>
      <details className="expense-options">
        <summary>Mais opções do gasto</summary>
        {credit ? (
          <Field label="Quantidade de parcelas no cartão (total contratado dividido em N)">
            <input
              name="installments"
              type="number"
              min={1}
              max={600}
              defaultValue={1}
            />
          </Field>
        ) : (
          <input type="hidden" name="installments" value="1" />
        )}
        {credit && (
          <>
            <Field label="Quem comprou">
              <select name="consumer" defaultValue={user.id}>
                {consumers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === user.id ? "Eu" : p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quem será responsável pelo gasto">
              <select name="responsible" key={card} defaultValue={user.id}>
                {responsible.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === user.id ? "Eu" : `${p.name} · titular do cartão`}
                  </option>
                ))}
              </select>
            </Field>
            <p className="form-help">
              Cada familiar registra a própria dívida. O titular já responde
              pelo cartão.
            </p>
          </>
        )}
        <Field label="Beneficiário (opcional)">
          <select name="beneficiary">
            <option value="">Não definido</option>
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tags separadas por vírgulas">
          <input
            name="tags"
            maxLength={250}
            placeholder="Ex.: escola, viagem"
          />
        </Field>
        {!credit && accounts.length > 1 && (
          <details>
            <summary>Dividir entre dois meios de pagamento</summary>
            <Field label="Segundo meio">
              <select name="second_account">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor pago no segundo meio (R$)">
              <input
                name="second_amount"
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
          </details>
        )}
        <details>
          <summary>Compra com parte pessoal e parte da Casa</summary>
          <Field label="Somente a parte da Casa (R$)">
            <input
              name="house_part"
              inputMode="decimal"
              placeholder="Deixe em branco se não dividir"
            />
          </Field>
          <Field label="Descrição visível à Casa">
            <input
              name="house_description"
              maxLength={120}
              placeholder="Parte compartilhada da compra"
            />
          </Field>
          <Field label="Categoria da parte da Casa">
            <select name="house_category">
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <p className="form-help">
            A parte pessoal fica privada. Cada centavo é registrado uma única
            vez.
          </p>
        </details>
      </details>
    </>
  );
}
