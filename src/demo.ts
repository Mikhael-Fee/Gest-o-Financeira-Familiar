import type { Perfil } from "./tipos";

// Pessoas fictícias para a demonstração. O repositório é público:
// nomes reais ficam só no banco de dados.
export const PERFIS_DEMO: Perfil[] = [
  { id: "demo-mae", nome: "Mãe", papel: "responsavel" },
  { id: "demo-pai", nome: "Pai", papel: "responsavel" },
  { id: "demo-filho", nome: "Filho", papel: "filho" },
  { id: "demo-filha", nome: "Filha", papel: "filho" },
];
