import { describe, expect, it } from "vitest";
import { normalizarUsuario, usuarioParaEmail } from "../src/usuario";
import { podeGerenciarCasa } from "../src/tipos";

describe("login por usuário", () => {
  it("ignora maiúsculas, acentos e espaços nas pontas", () => {
    expect(normalizarUsuario("  João ")).toBe("joao");
    expect(normalizarUsuario("MÃE")).toBe("mae");
  });

  it("troca espaços internos por ponto e remove símbolos", () => {
    expect(normalizarUsuario("Ana Maria!")).toBe("ana.maria");
  });

  it("gera o e-mail interno com o domínio padrão ou configurado", () => {
    expect(usuarioParaEmail("Pai")).toBe("pai@entrenos.local");
    expect(usuarioParaEmail("Pai", "familia.app")).toBe("pai@familia.app");
  });

  it("aceita quem digita o e-mail completo", () => {
    expect(normalizarUsuario("Mae@entrenos.local")).toBe("mae");
    expect(usuarioParaEmail("pai@entrenos.local ")).toBe("pai@entrenos.local");
    expect(usuarioParaEmail("pai@qualquercoisa.com")).toBe("pai@entrenos.local");
  });

  it("recusa usuário vazio", () => {
    expect(() => usuarioParaEmail("   ")).toThrow("Digite seu usuário.");
  });
});

describe("papéis", () => {
  it("só quem cuida da Casa gerencia despesas", () => {
    expect(podeGerenciarCasa({ id: "1", nome: "A", papel: "responsavel" })).toBe(true);
    expect(podeGerenciarCasa({ id: "2", nome: "B", papel: "filho" })).toBe(false);
  });
});
