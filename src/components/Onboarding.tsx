import { useId, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";

export type OnboardingAction =
  "account" | "salary" | "card" | "loan" | "category" | "recurrence";

type Step = {
  title: string;
  description: string;
  help: string;
  action?: OnboardingAction;
  actionLabel?: string;
};

const steps: readonly Step[] = [
  {
    title: "Seu acesso é individual",
    description:
      "O primeiro acesso começa em Tenho um convite. Cada pessoa escolhe seu nome de usuário e sua própria senha. Se você já entrou, essa etapa está resolvida.",
    help: "Não compartilhe senhas. Para recuperar o acesso, peça um código de uso único à administração e escolha Recuperar acesso na tela de entrada. Sair e limpar sessão protege aparelhos compartilhados.",
  },
  {
    title: "Comece por uma conta",
    description:
      "Cadastre uma conta bancária ou dinheiro em espécie. Informe o saldo que você conferiu e a data de referência; não precisa reconstruir movimentações antigas.",
    help: "Não sabe o saldo? Você pode deixar esta etapa para depois. Um zero informado não significa saldo confirmado no banco: use Conferir saldo quando souber o valor, com uma justificativa.",
    action: "account",
    actionLabel: "Cadastrar conta",
  },
  {
    title: "Planeje seu salário",
    description:
      "Informe sua referência de salário líquido e o dia provável de recebimento. Isso é uma previsão: não adiciona dinheiro ao saldo.",
    help: "Quando o dinheiro chegar, registre Salário efetivamente recebido, com competência salarial e data de entrada. Extras e bônus ficam separados. Você pode ajustar só um mês sem apagar o histórico.",
    action: "salary",
    actionLabel: "Configurar referência de salário",
  },
  {
    title: "Cadastre seus cartões",
    description:
      "Informe o apelido, o dia de fechamento e o dia de vencimento. São datas diferentes. Não informe número completo do cartão nem código de segurança.",
    help: "Se outra pessoa usa seu cartão, você poderá autorizá-la em Contas e cartões. Receber um Pix de acerto não significa que a fatura foi paga ao banco.",
    action: "card",
    actionLabel: "Cadastrar cartão",
  },
  {
    title: "Traga empréstimos em andamento",
    description:
      "Use o total de parcelas do contrato, o primeiro vencimento e a última parcela realmente paga. Se não souber a primeira data, informe uma parcela futura com data conhecida.",
    help: "Histórico desconhecido continua a conferir. Informar a última paga não quita automaticamente todas as anteriores. Cadastrar um contrato antigo não inventa saídas bancárias passadas.",
    action: "loan",
    actionLabel: "Cadastrar empréstimo existente",
  },
  {
    title: "Separe VA e VR",
    description:
      "Cadastre vale-alimentação e vale-refeição como contas de benefício independentes, com saldo e data de referência. Depois registre as recargas efetivamente recebidas.",
    help: "No formulário Conta ou benefício, escolha VA ou VR. Benefício não é salário em dinheiro. Uma compra pode combinar VA e débito, e só a parte destinada à Casa conta como contribuição familiar.",
    action: "account",
    actionLabel: "Cadastrar VA ou VR",
  },
  {
    title: "Organize suas categorias",
    description:
      "Crie categorias e subcategorias que façam sentido para você. Alimentação é uma categoria; cartão é um meio de pagamento. Beneficiário e responsável são informações separadas.",
    help: "Você pode começar com as categorias existentes e personalizar depois. Categorias particulares permanecem privadas.",
    action: "category",
    actionLabel: "Criar categoria",
  },
  {
    title: "Lembre das contas recorrentes",
    description:
      "Cadastre aluguel, internet, energia e outras contas que se repetem. Escolha valores fixos ou previstos; confirme o valor real das contas variáveis antes de pagar.",
    help: "Uma previsão não é um pagamento. Vencimentos antigos continuam visíveis até serem conferidos, pagos, cancelados ou renegociados com histórico.",
    action: "recurrence",
    actionLabel: "Cadastrar conta recorrente",
  },
  {
    title: "Conheça a Casa quando quiser",
    description:
      "Meu espaço funciona sozinho. A Casa é opcional e reúne somente despesas compartilhadas, vencimentos e contribuições; não mostra automaticamente seus salários, saldos ou dívidas particulares.",
    help: "Contas compartilhadas podem começar sem responsável. Quem pagar registra a origem do dinheiro. Meta flexível de contribuição não vira dívida se você contribuir menos.",
  },
];

/** Guide progress is only UI state; opening or skipping a step never creates financial data. */
export function Onboarding({
  onAction,
  onNavigate,
  initiallyOpen = false,
}: {
  onAction: (action: OnboardingAction) => void;
  onNavigate?: (path: "/casa") => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[index];

  function changeStep(next: number) {
    setIndex(next);
    // Keep keyboard focus at the changed content without creating an extra tab stop.
    requestAnimationFrame(() => heading.current?.focus());
  }

  function advance() {
    if (index < steps.length - 1) changeStep(index + 1);
    else {
      setFinished(true);
      setOpen(false);
    }
  }

  if (!open)
    return (
      <div className="panel">
        {finished && (
          <p role="status">
            Você percorreu o guia. Cadastre apenas o que souber agora; pode
            voltar a qualquer etapa quando precisar.
          </p>
        )}
        <button
          className="secondary"
          onClick={() => {
            setFinished(false);
            setOpen(true);
            changeStep(0);
          }}
        >
          <BookOpen size={18} aria-hidden="true" />
          {finished
            ? "Reabrir guia de primeiros passos"
            : "Guia de primeiros passos"}
        </button>
      </div>
    );

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="section-heading">
        <h2 id={headingId}>Primeiros passos no Entre Nós</h2>
        <button
          className="icon-button"
          aria-label="Fechar guia de primeiros passos"
          onClick={() => setOpen(false)}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>
      <p className="muted">Você pode pular qualquer etapa e voltar depois.</p>
      <div role="status" aria-live="polite" aria-atomic="true">
        <p className="muted">
          Etapa {index + 1} de {steps.length}
        </p>
        <h3 ref={heading} tabIndex={-1}>
          {step.title}
        </h3>
      </div>
      <p>{step.description}</p>
      <p className="muted">{step.help}</p>
      <div
        className="actions"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}
      >
        {step.action && (
          <button className="primary" onClick={() => onAction(step.action!)}>
            {step.actionLabel}
          </button>
        )}
        {index === steps.length - 1 && onNavigate && (
          <button className="secondary" onClick={() => onNavigate("/casa")}>
            Conhecer a Casa
          </button>
        )}
        {index > 0 && (
          <button className="secondary" onClick={() => changeStep(index - 1)}>
            <ChevronLeft aria-hidden="true" size={18} />
            Anterior
          </button>
        )}
        <button className="secondary" onClick={advance}>
          {index === steps.length - 1 ? "Concluir guia" : "Próxima etapa"}
          <ChevronRight aria-hidden="true" size={18} />
        </button>
        {index < steps.length - 1 && (
          <button className="text-button" onClick={advance}>
            Pular por enquanto
          </button>
        )}
      </div>
    </section>
  );
}
