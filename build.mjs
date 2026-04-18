#!/usr/bin/env node
/**
 * Chrome Extension Build Script
 *
 * Builds each entry point (content, background, popup) separately as IIFE bundles
 * to avoid ES module import statements which Chrome content scripts don't support.
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');

// Clean dist directory
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// Common build config
const commonConfig = {
  configFile: false,
  publicDir: false,
  build: {
    target: 'chrome88',
    minify: false,
    sourcemap: true,
    emptyOutDir: false,
  },
};

async function buildEntry(name, entryPath, outputDir, format = 'iife') {
  console.log(`Building ${name}...`);

  await build({
    ...commonConfig,
    build: {
      ...commonConfig.build,
      outDir: outputDir,
      lib: {
        entry: entryPath,
        name: name.replace(/[^a-zA-Z]/g, '_'),
        formats: [format === 'iife' ? 'iife' : 'es'],
        fileName: () => `${name}.js`,
      },
      rollupOptions: {
        output: {
          // For IIFE, wrap in self-executing function
          format: format,
          // Extend global object instead of creating new one
          extend: true,
          // No exports for content scripts
          exports: 'none',
        },
      },
    },
  });
}

async function main() {
  try {
    // Build content script (IIFE - no imports allowed)
    await buildEntry(
      'content',
      resolve(__dirname, 'src/content.ts'),
      distDir,
      'iife'
    );

    // Build network interceptor (IIFE - runs in MAIN world for Claude)
    await buildEntry(
      'network-interceptor',
      resolve(__dirname, 'src/network-interceptor.ts'),
      distDir,
      'iife'
    );

    // Build background script (IIFE - no imports allowed)
    await buildEntry(
      'background',
      resolve(__dirname, 'src/background.ts'),
      distDir,
      'iife'
    );

    // Build popup script (IIFE for simplicity, loaded via HTML)
    const popupDir = resolve(distDir, 'popup');
    mkdirSync(popupDir, { recursive: true });

    await buildEntry(
      'popup',
      resolve(__dirname, 'src/popup/popup.ts'),
      popupDir,
      'iife'
    );

    // Build onboarding script (IIFE for simplicity, loaded via HTML)
    const onboardingDir = resolve(distDir, 'onboarding');
    mkdirSync(onboardingDir, { recursive: true });

    await buildEntry(
      'onboarding',
      resolve(__dirname, 'src/onboarding/onboarding.ts'),
      onboardingDir,
      'iife'
    );

    // Copy static files
    console.log('Copying static files...');

    // Copy manifest.json
    copyFileSync(
      resolve(__dirname, 'manifest.json'),
      resolve(distDir, 'manifest.json')
    );

    // Copy popup.html
    copyFileSync(
      resolve(__dirname, 'src/popup/popup.html'),
      resolve(popupDir, 'popup.html')
    );

    // Copy onboarding.html
    copyFileSync(
      resolve(__dirname, 'src/onboarding/onboarding.html'),
      resolve(onboardingDir, 'onboarding.html')
    );

    // Copy styles.css
    copyFileSync(
      resolve(__dirname, 'src/ui/styles.css'),
      resolve(distDir, 'styles.css')
    );

    // Copy page scripts (run in page context, not bundled)
    const pageScriptsDir = resolve(__dirname, 'src/pageScripts');
    const distPageScriptsDir = resolve(distDir, 'pageScripts');
    if (existsSync(pageScriptsDir)) {
      mkdirSync(distPageScriptsDir, { recursive: true });
      const pageScripts = ['reactFileRestore.js', 'geminiFileRestore.js', 'perplexityLexicalBridge.js'];
      for (const script of pageScripts) {
        const src = resolve(pageScriptsDir, script);
        if (existsSync(src)) {
          copyFileSync(src, resolve(distPageScriptsDir, script));
        }
      }
    }

    // Copy icons if they exist
    const iconsDir = resolve(__dirname, 'public/icons');
    const distIconsDir = resolve(distDir, 'icons');
    if (existsSync(iconsDir)) {
      mkdirSync(distIconsDir, { recursive: true });
      const icons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
      for (const icon of icons) {
        const src = resolve(iconsDir, icon);
        if (existsSync(src)) {
          copyFileSync(src, resolve(distIconsDir, icon));
        }
      }
    }

    // Copy ONNX runtime + WASM files (separate from content.js to avoid 67MB bundle)
    const ortDist = resolve(__dirname, 'node_modules/onnxruntime-web/dist');
    const ortFiles = [
      'ort.all.bundle.min.mjs',
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.jsep.mjs',
      'ort-wasm-simd-threaded.jsep.wasm',
    ];
    for (const f of ortFiles) {
      const src = resolve(ortDist, f);
      if (existsSync(src)) {
        copyFileSync(src, resolve(distDir, f));
      }
    }
    console.log('  Copied ONNX runtime + WASM files');

    // Copy model files if they exist in project root model/ directory
    const modelSrcDir = resolve(__dirname, 'model');
    if (existsSync(modelSrcDir)) {
      const distModelDir = resolve(distDir, 'model');
      mkdirSync(distModelDir, { recursive: true });
      const modelFiles = ['model.onnx', 'manifest.json', 'model_card.json'];
      for (const f of modelFiles) {
        const src = resolve(modelSrcDir, f);
        if (existsSync(src)) copyFileSync(src, resolve(distModelDir, f));
      }
      const tokDir = resolve(modelSrcDir, 'tokenizer');
      if (existsSync(tokDir)) {
        const distTokDir = resolve(distModelDir, 'tokenizer');
        mkdirSync(distTokDir, { recursive: true });
        const tokFiles = ['vocab.txt', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json'];
        for (const f of tokFiles) {
          const src = resolve(tokDir, f);
          if (existsSync(src)) copyFileSync(src, resolve(distTokDir, f));
        }
      }
      console.log('  Copied model files');
    }

    console.log('✓ Build complete!');
    console.log(`  Output: ${distDir}`);

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
