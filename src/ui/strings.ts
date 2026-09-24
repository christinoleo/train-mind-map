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
} as const;
