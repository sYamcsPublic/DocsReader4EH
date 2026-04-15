import { waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk'

export function isSimulatorMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  const simParam = params.get('simulator')
  if (simParam === 'true') {
    sessionStorage.setItem('simulator_mode', 'true')
    return true
  } else if (simParam === 'false') {
    sessionStorage.removeItem('simulator_mode')
    return false
  }
  return sessionStorage.getItem('simulator_mode') === 'true'
}


// --- Environment Checks ---

export async function probeBridge(): Promise<boolean> {
  // Simulator mode always allows connection UI
  if (isSimulatorMode()) return true;

  // Basic check for mobile environment - Most PC browsers shouldn't show this unless in simulator
  const isMobile = /Android|webOS|iPhone|iPad|iPod|Blackberry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (!isMobile) {
    console.log('[probeBridge] Generic PC browser detected, skipping bridge probe.');
    return false;
  }

  // We should actually try to get the bridge and see if it responds to a call
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('[probeBridge] Timeout: No bridge responsive.');
      resolve(false);
    }, 1500);

    waitForEvenAppBridge().then(async (bridge) => {
      if (!bridge) {
        clearTimeout(timeout);
        resolve(false);
        return;
      }

      try {
        // Try to get some info to verify it's a real active bridge
        await bridge.getDeviceInfo();
        clearTimeout(timeout);
        // If we got here, the bridge is alive and responding!
        console.log(`[probeBridge] Real bridge verified.`);
        resolve(true);
      } catch (e) {
        clearTimeout(timeout);
        console.log('[probeBridge] Bridge object present but not responsive:', e);
        resolve(false);
      }
    }).catch(() => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

export function showSimulatorInstructions(): void {
  if (!isSimulatorMode()) return

  // Check if already exists
  if (document.getElementById('simulator-banner')) return;

  console.log('[Simulator] Mode active')

  // Create a small banner in the web view
  const banner = document.createElement('div')
  banner.id = 'simulator-banner'
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    background: #10b981; color: black;
    padding: 4px 12px; font-size: 10px; font-weight: bold;
    text-align: center; z-index: 9999;
    transition: transform 0.3s ease;
  `
  banner.textContent = 'SIMULATOR MODE ACTIVE - R1 RING CONNECTED'
  document.body.appendChild(banner)
}

export function setSimulatorBannerVisible(visible: boolean): void {
  const banner = document.getElementById('simulator-banner');
  if (banner) {
    banner.style.transform = visible ? 'translateY(0)' : 'translateY(-100%)';
  }
}

export async function getBridge(): Promise<EvenAppBridge> {
  showSimulatorInstructions()
  return await waitForEvenAppBridge()
}
