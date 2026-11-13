import {
  addMonths,
  contribution,
  remaining,
  today,
  type Entry,
  type State,
} from "./finance";

export type ReportScope = "personal" | "house";
export type ConsumptionFilters = {
  category: string;
  source: string;
  personId: string;
};
export type AmountGroup = { key: string; label: string; amount: number };
export const noConsumptionFilters: ConsumptionFilters = {
  category: "all",
  source: "all",
  personId: "all",
};

export function reportMonths(end: string, count: number) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(end) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 24
  )
    throw Error("Período inválido.");
  return Array.from({ length: count }, (_, i) =>
    addMonths(end + "-01", i - count + 1).slice(0, 7),
  );
}
export function monthLabel(month: string, short = false) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    month: short ? "short" : "long",
    year: short ? "2-digit" : "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(month + "-01T12:00:00Z"));
  const name = parts.find((p) => p.type === "month")!.value.replace(/\.$/, "");
  const year = parts.find((p) => p.type === "year")!.value;
  return short ? name + "/" + year : name + " de " + year;
}

// Works only from the authorized snapshot. Card holder is not the consumer.
export function consumptionRows(
  s: State,
  owner: string,
  scope: ReportScope,
  filters = noConsumptionFilters,
  asOf = today(),
) {
  const account = filters.source.startsWith("account:")
    ? s.accounts.find(
        (a) => a.id === filters.source.slice(8) && a.owner_id === owner,
      )
    : undefined;
  const card = filters.source.startsWith("card:")
    ? s.cards.find(
        (c) =>
          c.id === filters.source.slice(5) &&
          (c.owner_id === owner || c.authorized.includes(owner)),
      )
    : undefined;
  return s.entries
    .filter(
      (e) =>
        !e.voided &&
        e.kind === "expense" &&
        e.occurred_on <= asOf &&
        (scope === "house" ? e.house : e.consumer_id === owner) &&
        (scope !== "house" ||
          filters.personId === "all" ||
          e.consumer_id === filters.personId) &&
        (filters.category === "all" || e.category === filters.category),
    )
    .map((entry) => ({
      entry,
      amount:
        filters.source === "all"
          ? entry.amount
          : account
            ? entry.splits
                .filter((p) => p.account_id === account.id)
                .reduce((n, p) => n + p.amount, 0)
            : card && entry.card_id === card.id
              ? entry.amount
              : 0,
    }))
    .filter((row) => row.amount > 0);
}

function grouped(
  values: { key: string; label: string; amount: number }[],
): AmountGroup[] {
  const groups = new Map<string, AmountGroup>();
  for (const item of values) {
    const old = groups.get(item.key);
    groups.set(item.key, { ...item, amount: item.amount + (old?.amount ?? 0) });
  }
  return [...groups.values()]
    .filter((g) => g.amount > 0)
    .sort(
      (a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"),
    );
}

export function consumptionReport(
  s: State,
  owner: string,
  scope: ReportScope,
  month: string,
  count = 6,
  filters = noConsumptionFilters,
  asOf = today(),
) {
  const all = consumptionRows(s, owner, scope, filters, asOf);
  const current = all.filter(({ entry }) =>
    entry.occurred_on.startsWith(month),
  );
  const categories = grouped(
    current.map(({ entry, amount }) => ({
      key: entry.category,
      label: entry.category,
      amount,
    })),
  );
  const sources = grouped(
    current.flatMap(({ entry, amount }) => {
      if (entry.card_id)
        return [{ key: "credit", label: "Cartão de crédito", amount }];
      return entry.splits
        .filter(
          (p) =>
            filters.source === "all" ||
            filters.source === "account:" + p.account_id,
        )
        .map((p) => {
          const account = s.accounts.find(
            (a) => a.id === p.account_id && a.owner_id === owner,
          );
          const kind = account?.kind;
          const key =
            kind === "VA" || kind === "VR" ? kind : kind ? "money" : "private";
          return {
            key,
            label:
              key === "money"
                ? "Banco / dinheiro"
                : key === "private"
                  ? "Fonte privada de outro membro"
                  : key,
            amount: p.amount,
          };
        });
    }),
  );
  const history = reportMonths(month, count).map((m) => {
    const entries = all.filter(({ entry }) => entry.occurred_on.startsWith(m));
    return {
      month: m,
      personal: entries
        .filter(({ entry }) => !entry.house)
        .reduce((n, e) => n + e.amount, 0),
      house: entries
        .filter(({ entry }) => entry.house)
        .reduce((n, e) => n + e.amount, 0),
      total: entries.reduce((n, e) => n + e.amount, 0),
    };
  });
  return {
    categories,
    sources,
    history,
    total: current.reduce((n, e) => n + e.amount, 0),
    count: current.length,
  };
}

// Actual movements use operation dates and each account's opening cutoff.
// Reversals keep the original debit and its dated correcting credit, like balance().
export function cashReport(
  s: State,
  owner: string,
  month: string,
  count = 6,
  asOf = today(),
) {
  const accounts = s.accounts.filter(
    (a) => a.owner_id === owner && (a.kind === "bank" || a.kind === "cash"),
  );
  const visible = (id: string, on: string) =>
    accounts.some((a) => a.id === id && on >= a.cutoff && on <= asOf);
  const events: { on: string; amount: number }[] = [];
  for (const e of s.entries) {
    if (e.voided || e.kind === "transfer" || e.kind === "benefit") continue;
    for (const p of e.splits)
      if (visible(p.account_id, e.occurred_on))
        events.push({
          on: e.occurred_on,
          amount: p.amount * (e.kind === "expense" ? -1 : 1),
        });
  }
  for (const p of s.payments)
    if (p.payer_id === owner && visible(p.account_id, p.paid_on))
      events.push({ on: p.paid_on, amount: -p.amount });
  for (const m of s.account_movements)
    if (
      m.owner_id === owner &&
      ["settlement", "reversal"].includes(m.kind) &&
      visible(m.account_id, m.occurred_on)
    )
      events.push({ on: m.occurred_on, amount: m.amount });
  return reportMonths(month, count).map((m) => {
    const items = events.filter((e) => e.on.startsWith(m));
    const incoming = items
      .filter((e) => e.amount > 0)
      .reduce((n, e) => n + e.amount, 0);
    const outgoing = items
      .filter((e) => e.amount < 0)
      .reduce((n, e) => n - e.amount, 0);
    return { month: m, incoming, outgoing, net: incoming - outgoing };
  });
}

export function scopedObligations(s: State, owner: string, scope: ReportScope) {
  return s.obligations.filter((o) =>
    scope === "house" ? o.house : o.owner_id === owner,
  );
}
export function obligationWarnings(
  s: State,
  owner: string,
  scope: ReportScope,
  month: string,
) {
  const rows = scopedObligations(s, owner, scope);
  return {
    older: rows
      .filter((o) => o.due_on !== null && o.due_on < month + "-01")
      .reduce((n, o) => n + remaining(o, s.payments), 0),
    undated: rows
      .filter((o) => o.due_on === null)
      .reduce((n, o) => n + remaining(o, s.payments), 0),
  };
}
export function contributionReport(
  s: State,
  owner: string,
  scope: ReportScope,
  month: string,
  asOf = today(),
) {
  const confirmed = {
    ...s,
    entries: s.entries.filter((e) => e.occurred_on <= asOf),
    payments: s.payments.filter((p) => p.paid_on <= asOf),
  };
  return s.profiles
    .filter((p) => scope === "house" || p.id === owner)
    .map((p) => ({
      id: p.id,
      name: p.name,
      actual: contribution(confirmed, p.id, month).actual,
      // Another member's private goal must not be inferred as zero.
      goal:
        p.id === owner
          ? (s.goals.find((g) => g.owner_id === owner && g.month === month)
              ?.amount ?? null)
          : null,
    }));
}

export function categoryOptions(entries: Entry[]) {
  return [...new Set(entries.map((e) => e.category))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
