// Every player-visible string, in pt-BR. Components read text from here by key
// so a second locale can be added without touching them.
export const strings = {
  crash: {
    title: "Algo deu errado",
    body: "O jogo encontrou um erro e foi pausado.",
    reload: "Recarregar",
    exportSave: "Exportar save",
    exported: "Save copiado para a área de transferência",
    exportFailed: "Não foi possível copiar o save",
  },
  // The rendering stress-test page (stress.html), used on real phones.
  stress: {
    items: "Itens",
    trains: "Trens",
    lod: "LOD",
    on: "ligado",
    off: "desligado",
    loseContext: "Forçar perda de contexto",
    contextLost: "contexto perdido",
    contextRestored: "contexto recuperado",
    copy: "copiar resultados",
    copied: "Resultados copiados",
    copyFailed: "Não foi possível copiar; selecione o texto abaixo",
    noWebgl: "Este teste precisa de WebGL, indisponível neste navegador.",
    hide: "ocultar",
    show: "mostrar",
  },
} as const;
