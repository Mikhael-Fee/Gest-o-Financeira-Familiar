import { useState } from "react";
import { supabase } from "./supabase";
import { Folha } from "./Folha";

/** Trocar a própria senha: confere a senha atual antes de mudar. */
export function TrocarSenha({ fechar, pronto }: { fechar: () => void; pronto: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ver, setVer] = useState(false);

  async function enviar(): Promise<string | void> {
    if (!supabase) return "Na demonstração não dá para trocar a senha.";
    if (!atual) return "Digite a senha atual.";
    if (nova.length < 8) return "A nova senha precisa ter pelo menos 8 caracteres.";
    if (nova !== repetir) return "As duas novas senhas não são iguais.";
    if (nova === atual) return "A nova senha precisa ser diferente da atual.";
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) return "Entre de novo e tente outra vez.";
    const conferir = await supabase.auth.signInWithPassword({ email, password: atual });
    if (conferir.error) return "A senha atual não confere.";
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) return /weak|short|characters/i.test(error.message) ? "Senha fraca demais. Use letras e números." : "Não foi possível trocar a senha. Tente de novo.";
    pronto();
  }

  const tipo = ver ? "text" : "password";
  return (
    <Folha titulo="Trocar senha" fechar={fechar} salvar={enviar} textoSalvar="Trocar senha">
      <label className="campo" htmlFor="p-atual">Senha atual<input id="p-atual" type={tipo} autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} /></label>
      <label className="campo" htmlFor="p-nova">Nova senha<input id="p-nova" type={tipo} autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} /></label>
      <label className="campo" htmlFor="p-repetir">Repita a nova senha<input id="p-repetir" type={tipo} autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} /></label>
      <label className="campo marcar" htmlFor="p-ver"><input id="p-ver" type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />Mostrar as senhas</label>
      <p className="nota">Pelo menos 8 caracteres. Você continua conectado neste aparelho.</p>
    </Folha>
  );
}
