import { useEffect, useState } from "react";

type EventoInstalar = Event & { prompt: () => Promise<void> };

const jaInstalado = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// Mostra "Instalar app" no Android/Chrome e a explicação no iPhone.
export function BotaoInstalar() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    const pegar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", pegar);
    return () => window.removeEventListener("beforeinstallprompt", pegar);
  }, []);

  if (jaInstalado()) return null;

  if (evento)
    return (
      <button className="btn instalar" onClick={() => evento.prompt().then(() => setEvento(null))}>
        Instalar o app no celular
      </button>
    );

  if (ehIphone())
    return (
      <p className="nota instalar">
        Para instalar no iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.
      </p>
    );

  return null;
}
