import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: pkg.displayName,
  description: pkg.description,
  version: pkg.version,
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    // The toolbar draws at 16, and at 32 on a hidpi screen; the rest of the
    // set above covers the extensions page, the management list and the store.
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
    },
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [{
    js: ['src/content/main.ts'],
    matches: ['http://*/*', 'https://*/*'],
    run_at: 'document_idle',
    all_frames: false,
  }],
  permissions: [
    'offscreen',
    'storage',
    'tabCapture',
    'tabs',
  ],
})
