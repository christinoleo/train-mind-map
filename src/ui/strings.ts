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
  // Labels drawn on the map.
  map: {
    core: "Core",
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
  // The debug tools (?debug=1 or a dev build): performance overlay and the
  // superadmin panel.
  debug: {
    admin: "admin",
    close: "fechar",
    seed: "Seed",
    regenerate: "Regenerar",
    speed: "Velocidade",
    teleport: "Teleportar",
    go: "Ir",
    revealRing: "Anel revelado",
    overlays: "Overlays",
    coreRings: "Anéis de depósito e raios de garantia",
    nodes: "nós",
    edges: "arestas",
    items: "itens",
    trains: "trens",
    tick: "tick",
    render: "render",
    heap: "heap",
    notAvailable: "n/d",
  },
} as const;
