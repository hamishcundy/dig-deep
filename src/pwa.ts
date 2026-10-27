// Home-screen install and offline play.
// Chrome and Edge give the page an install prompt it can show from a button.
// iPhone and iPad have no install API, so the player adds it from the Share menu.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let promptEvent: InstallPromptEvent | null = null;
let changed: (() => void) | null = null;

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we offer it from the title screen instead
    promptEvent = e as InstallPromptEvent;
    changed?.();
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    changed?.();
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Tell the worker what this page loaded, so it can cache it for offline play
        // and drop files from older versions.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((url) => url.startsWith(location.origin));
        reg.active?.postMessage({ keep: urls });
      })
      .catch(() => {
        // no offline play; the game still works online
      });
  }
}

// How this browser can install the game, if it isn't installed already.
export function installOption(): 'prompt' | 'ios' | null {
  if (isInstalled()) return null;
  if (promptEvent) return 'prompt';
  return isIos() ? 'ios' : null;
}

export async function showInstallPrompt(): Promise<void> {
  const e = promptEvent;
  if (!e) return;
  await e.prompt();
  await e.userChoice;
  promptEvent = null; // each prompt can only be shown once
  changed?.();
}

export function onInstallChange(fn: () => void): void {
  changed = fn;
}

function isInstalled(): boolean {
  return (
    matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// iPads report themselves as Macs, but Macs don't have touch screens.
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}
