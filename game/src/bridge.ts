// bridge.ts - Versión Mínima
export class RedditBridge {
  private static instance: RedditBridge;

  private constructor() {
    // En el futuro, aquí escucharás mensajes de Reddit
  }

  public static getInstance(): RedditBridge {
    if (!this.instance) this.instance = new RedditBridge();
    return this.instance;
  }

  // Inicializa la comunicación
  public init() {
    // Avisamos al padre (Reddit iframe) que estamos listos.
    // Aunque Devvit aún no escuche esto, es buena práctica.
    if (window.parent) {
      window.parent.postMessage({ type: 'GAME_LOADED' }, '*');
      console.log('[Phaser] Bridge initialized - Hello Reddit!');
    }
  }
}

export const bridge = RedditBridge.getInstance();
