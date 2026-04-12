import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Chrome extension Vite config
// Content and background scripts are built as IIFE to avoid import statements
// Popup is built as ES module (loaded via HTML)

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    target: 'chrome88',
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content.ts'),
        background: resolve(__dirname, 'src/background.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
        onboarding: resolve(__dirname, 'src/onboarding/onboarding.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'popup') {
            return 'popup/[name].js';
          }
          if (chunkInfo.name === 'onboarding') {
            return 'onboarding/[name].js';
          }
          return '[name].js';
        },
        // Key: disable code splitting entirely
        inlineDynamicImports: false,
        // Don't preserve modules - bundle everything
        preserveModules: false,
      },
      // Mark nothing as external - bundle everything
      external: [],
      // Prevent tree-shaking from creating shared chunks
      treeshake: {
        moduleSideEffects: true,
      },
    },
    minify: false,
    sourcemap: true,
    cssCodeSplit: false,
    // Force all code into entry chunks
    chunkSizeWarningLimit: 500,
  },
  publicDir: 'public',
  plugins: [
    {
      name: 'copy-extension-files',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        const popupDir = resolve(distDir, 'popup');
        const onboardingDir = resolve(distDir, 'onboarding');

        if (!existsSync(popupDir)) {
          mkdirSync(popupDir, { recursive: true });
        }

        if (!existsSync(onboardingDir)) {
          mkdirSync(onboardingDir, { recursive: true });
        }

        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(distDir, 'manifest.json')
        );

        copyFileSync(
          resolve(__dirname, 'src/popup/popup.html'),
          resolve(popupDir, 'popup.html')
        );

        copyFileSync(
          resolve(__dirname, 'src/onboarding/onboarding.html'),
          resolve(onboardingDir, 'onboarding.html')
        );

        copyFileSync(
          resolve(__dirname, 'src/ui/styles.css'),
          resolve(distDir, 'styles.css')
        );
      },
    },
  ],
});
