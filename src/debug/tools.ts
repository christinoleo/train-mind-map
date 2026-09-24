declare global {
  interface Window {
    /** Throws an uncaught error, to exercise the crash screen. */
    crash?: () => void;
  }
}

export function installDebugTools() {
  window.crash = () => {
    setTimeout(() => {
      throw new Error("debug crash");
    });
  };
}
