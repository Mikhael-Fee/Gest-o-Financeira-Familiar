// Login por nome de usuário. O Supabase trabalha com e-mail, então cada
// usuário vira um e-mail interno que nunca recebe mensagens.
// Ex.: "João" -> "joao@entrenos.local"

export const DOMINIO_PADRAO = "entrenos.local";

export function normalizarUsuario(usuario: string): string {
  // Aceita também o e-mail completo (ex.: "mae@entrenos.local"): usa só a parte antes do @.
  return usuario
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

export function usuarioParaEmail(usuario: string, dominio = DOMINIO_PADRAO): string {
  const nome = normalizarUsuario(usuario);
  if (!nome) throw new Error("Digite seu usuário.");
  return `${nome}@${dominio}`;
}
