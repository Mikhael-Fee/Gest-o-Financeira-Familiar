export type Papel = "responsavel" | "filho";

export type Perfil = {
  id: string;
  nome: string;
  papel: Papel;
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  responsavel: "Cuida da Casa",
  filho: "Ajuda a Casa",
};

export const podeGerenciarCasa = (p: Perfil) => p.papel === "responsavel";
