import { useEffect, useId, useRef, useState } from "react";
import { money } from "../domain/finance";
import type { AmountGroup } from "../domain/reports";
import { Empty, Field } from "./ui";

export const chartColors = [
  "#8baeff",
  "#7cdbc1",
  "#f2c879",
  "#bd9dfa",
  "#f3a8c1",
  "#6dd6dc",
  "#e9a27f",
  "#c2d889",
];
export type ChartSeries = { label: string; color: string };
export type ChartPoint = {
  key: string;
  label: string;
  values: (number | null)[];
  estimated?: boolean;
};
const compactMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v / 100);
function niceCeiling(value: number) {
  const power = 10 ** Math.floor(Math.log10(value));
  const step =
    [1, 1.5, 2, 2.5, 5, 7.5, 10].find((n) => n * power >= value) ?? 10;
  return step * power;
}
function Swatch({ color }: { color: string }) {
  return (
    <svg className="chart-swatch" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="4" fill={color} />
    </svg>
  );
}
export function ChartTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <details className="chart-table">
      <summary>Ver dados em tabela · {title}</summary>
      <div className="table-scroll">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {c}
                    </th>
                  ) : (
                    <td key={j}>{c}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function DonutChart({
  title,
  groups,
  empty,
}: {
  title: string;
  groups: AmountGroup[];
  empty: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState("");
  const total = groups.reduce((n, g) => n + g.amount, 0);
  if (!total) return <Empty>{empty}</Empty>;
  const active = groups.find((g) => g.key === selected);
  const circumference = 2 * Math.PI * 88;
  const arcs = groups.map((g, i) => ({
    ...g,
    length: (g.amount / total) * circumference,
    offset:
      (groups.slice(0, i).reduce((n, prev) => n + prev.amount, 0) / total) *
      circumference,
  }));
  return (
    <figure className="donut-figure">
      <div className="donut-layout">
        <svg
          viewBox="0 0 240 240"
          role="img"
          aria-labelledby={id + "-title " + id + "-desc"}
          className="donut-svg"
        >
          <title id={id + "-title"}>{"Gráfico de " + title}</title>
          <desc id={id + "-desc"}>
            {"Distribuição de " +
              money(total) +
              ". Selecione uma legenda para destacar um valor. Os dados completos estão na tabela."}
          </desc>
          {arcs.map((g, i) => (
            <g key={g.key} onClick={() => setSelected(g.key)}>
              <circle
                cx="120"
                cy="120"
                r="88"
                fill="none"
                stroke={chartColors[i % chartColors.length]}
                strokeWidth={active?.key === g.key ? 34 : 26}
                strokeDasharray={
                  String(g.length) + " " + String(circumference - g.length)
                }
                strokeDashoffset={-g.offset}
                transform="rotate(-90 120 120)"
              >
                <title>{g.label + ": " + money(g.amount)}</title>
              </circle>
            </g>
          ))}
          <text x="120" y="113" textAnchor="middle" className="donut-label">
            {active ? "Em destaque" : "Total do mês"}
          </text>
          <text x="120" y="142" textAnchor="middle" className="donut-total">
            {compactMoney(active?.amount ?? total)}
          </text>
        </svg>
        <div
          className="chart-key"
          role="group"
          aria-label={"Legenda de " + title}
        >
          {groups.map((g, i) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={active?.key === g.key}
              onClick={() => setSelected(active?.key === g.key ? "" : g.key)}
            >
              <Swatch color={chartColors[i % chartColors.length]} />
              <span className="chart-key-name">
                {g.label}
                <small>
                  {new Intl.NumberFormat("pt-BR", {
                    style: "percent",
                    maximumFractionDigits: 1,
                  }).format(g.amount / total)}
                </small>
              </span>
              <strong>{money(g.amount)}</strong>
            </button>
          ))}
        </div>
      </div>
      <figcaption className="chart-selection" aria-live="polite">
        {active
          ? active.label + ": " + money(active.amount)
          : "Total: " + money(total)}
      </figcaption>
      <ChartTable
        title={title}
        columns={["Grupo", "Valor", "Participação"]}
        rows={groups.map((g) => [
          g.label,
          money(g.amount),
          new Intl.NumberFormat("pt-BR", {
            style: "percent",
            maximumFractionDigits: 1,
          }).format(g.amount / total),
        ])}
      />
    </figure>
  );
}

export function ColumnChart({
  title,
  points,
  series,
  line,
  empty = "Ainda não há registros nesse período.",
  selectionLabel = "Mês em destaque",
}: {
  title: string;
  points: ChartPoint[];
  series: ChartSeries[];
  line?: { label: string; color: string; values: number[] };
  empty?: string;
  selectionLabel?: string;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.floor(entry.contentRect.width))),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const foundIndex = points.findIndex((p) => p.key === selected);
  const activeIndex = foundIndex < 0 ? points.length - 1 : foundIndex;
  const active = points[activeIndex];
  const numbers = points
    .flatMap((p) => p.values.filter((v): v is number => v !== null))
    .concat(line?.values ?? []);
  const hasData = numbers.some((n) => n !== 0);
  const max = niceCeiling(Math.max(100, ...numbers));
  const negative = Math.min(0, ...numbers);
  const min = negative < 0 ? -niceCeiling(-negative) : 0;
  const left = 65,
    right = 12,
    top = 20,
    height = 280,
    bottom = 42;
  const innerWidth = width - left - right,
    innerHeight = height - top - bottom;
  const y = (value: number) =>
    top + ((max - value) / (max - min)) * innerHeight;
  const step = innerWidth / Math.max(1, points.length);
  const barWidth = Math.max(2, Math.min(24, (step * 0.65) / series.length));
  const labelEvery =
    width < 460 ? Math.ceil(points.length / 4) : Math.ceil(points.length / 6);
  return (
    <figure className="column-figure">
      <div className="chart-legend" aria-label={"Séries de " + title}>
        {series.map((s) => (
          <span key={s.label}>
            <Swatch color={s.color} />
            {s.label}
          </span>
        ))}
        {line && (
          <span className="line-legend">
            <svg viewBox="0 0 24 16" aria-hidden="true">
              <path
                d="M0 8H24"
                stroke={line.color}
                strokeWidth="3"
                strokeDasharray="4 3"
              />
            </svg>
            {line.label}
          </span>
        )}
      </div>
      <div ref={container} className="chart-canvas">
        {hasData ? (
          <svg
            viewBox={"0 0 " + width + " " + height}
            role="img"
            aria-labelledby={id + "-title " + id + "-desc"}
          >
            <title id={id + "-title"}>{"Gráfico de " + title}</title>
            <desc id={id + "-desc"}>
              Valores em reais. Toque em uma coluna ou escolha o período abaixo.
              A linha tracejada representa a diferença quando disponível;
              valores negativos ficam abaixo de zero. Há uma tabela alternativa.
            </desc>
            {Array.from(
              { length: 5 },
              (_, i) => max - ((max - min) * i) / 4,
            ).map((tick, i) => (
              <g key={i}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="chart-grid-line"
                />
                <text
                  x={left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  className="chart-axis"
                >
                  {compactMoney(tick)}
                </text>
              </g>
            ))}
            <line
              x1={left}
              x2={width - right}
              y1={y(0)}
              y2={y(0)}
              className="chart-zero-line"
            />
            {points.map((p, i) => {
              const middle = left + step * (i + 0.5);
              return (
                <g
                  key={p.key}
                  onClick={() => setSelected(p.key)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setSelected(p.key);
                  }}
                >
                  <rect
                    x={left + step * i}
                    y={top}
                    width={step}
                    height={innerHeight}
                    fill={i === activeIndex ? "#25384e" : "transparent"}
                    rx="4"
                  />
                  {p.values.map((v, j) =>
                    v === null ? null : (
                      <rect
                        key={j}
                        x={
                          middle - (barWidth * series.length) / 2 + barWidth * j
                        }
                        y={Math.min(y(v), y(0))}
                        width={Math.max(1, barWidth - 2)}
                        height={Math.max(
                          v === 0 ? 0 : 1,
                          Math.abs(y(v) - y(0)),
                        )}
                        fill={series[j].color}
                        rx="3"
                        stroke={p.estimated && j === 0 ? "#e8edf3" : "none"}
                        strokeDasharray={
                          p.estimated && j === 0 ? "3 3" : undefined
                        }
                        strokeWidth="1"
                      >
                        <title>
                          {p.label +
                            " · " +
                            series[j].label +
                            ": " +
                            money(v) +
                            (p.estimated && j === 0 ? " · estimativa" : "")}
                        </title>
                      </rect>
                    ),
                  )}
                  {(i === points.length - 1 ||
                    (i % labelEvery === 0 &&
                      points.length - 1 - i >= labelEvery)) && (
                    <text
                      x={middle}
                      y={height - 16}
                      textAnchor={
                        i === 0
                          ? "start"
                          : i === points.length - 1
                            ? "end"
                            : "middle"
                      }
                      className="chart-axis"
                    >
                      {p.label.length > 14
                        ? p.label.slice(0, 12) + "…"
                        : p.label}
                    </text>
                  )}
                </g>
              );
            })}
            {line && (
              <polyline
                points={line.values
                  .map((v, i) => String(left + step * (i + 0.5)) + "," + y(v))
                  .join(" ")}
                fill="none"
                stroke={line.color}
                strokeWidth="2.5"
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            )}
          </svg>
        ) : (
          <Empty>{empty}</Empty>
        )}
      </div>
      {active && (
        <>
          <Field label={selectionLabel + " · " + title}>
            <select
              value={active.key}
              onChange={(e) => setSelected(e.target.value)}
            >
              {points.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <figcaption className="chart-selection" aria-live="polite">
            <strong>
              {active.label}
              {active.estimated ? " · estimativa" : ""}
            </strong>
            {series.map((s, i) => (
              <span key={s.label}>
                {s.label}:{" "}
                <b>
                  {active.values[i] === null
                    ? "Não compartilhada"
                    : money(active.values[i] ?? 0)}
                </b>
              </span>
            ))}
            {line && (
              <span>
                {line.label}:{" "}
                <b
                  className={
                    line.values[activeIndex] < 0 ? "chart-negative" : "positive"
                  }
                >
                  {money(line.values[activeIndex])}
                </b>
              </span>
            )}
          </figcaption>
        </>
      )}
      <ChartTable
        title={title}
        columns={[
          selectionLabel.startsWith("Pessoa") ? "Pessoa" : "Mês",
          ...series.map((s) => s.label),
          ...(line ? [line.label] : []),
          "Informação",
        ]}
        rows={points.map((p, i) => [
          p.label,
          ...p.values.map((v) => (v === null ? "Não compartilhada" : money(v))),
          ...(line ? [money(line.values[i])] : []),
          p.estimated ? "Estimativa" : "Registrado",
        ])}
      />
    </figure>
  );
}
