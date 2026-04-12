/**
 * Obfusca File Icons & Language Detection
 *
 * Provides two categories of icons for the code block preview:
 * A) Devicon-inspired language icons (colored, simplified for 16x16)
 * B) Monochrome Lucide-style icons for generic file types
 *
 * Plus a file type detection function that maps filenames to icon + language + label.
 */

// ---------------------------------------------------------------------------
// A) Devicon-inspired language icons (colored, optimized for 16x16)
//    Based on official Devicon designs from https://devicon.dev/
// ---------------------------------------------------------------------------

const DEVICON_ICONS: Record<string, string> = {
  javascript: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#F0DB4F"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#323330">JS</text></svg>`,
  typescript: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3178C6"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">TS</text></svg>`,
  python: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3776AB"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#FFD43B">Py</text></svg>`,
  java: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E76F00"/><text x="8" y="12.5" text-anchor="middle" font-family="serif" font-size="10" font-weight="bold" fill="#fff">J</text></svg>`,
  go: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00ADD8"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Go</text></svg>`,
  rust: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#DEA584"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#000">Rs</text></svg>`,
  ruby: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#CC342D"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Rb</text></svg>`,
  php: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#777BB4"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#fff">PHP</text></svg>`,
  swift: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#F05138"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Sw</text></svg>`,
  kotlin: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#7F52FF"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Kt</text></svg>`,
  c: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#A8B9CC"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="#fff">C</text></svg>`,
  cplusplus: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00599C"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#fff">C++</text></svg>`,
  csharp: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#68217A"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">C#</text></svg>`,
  html5: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E44D26"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#fff">HTML</text></svg>`,
  css3: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#264DE4"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7.5" font-weight="bold" fill="#fff">CSS</text></svg>`,
  sass: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#CD6799"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">S</text></svg>`,
  react: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#20232A"/><circle cx="8" cy="8" r="1.5" fill="#61DAFB"/><ellipse cx="8" cy="8" rx="6" ry="2.5" fill="none" stroke="#61DAFB" stroke-width="0.7"/><ellipse cx="8" cy="8" rx="6" ry="2.5" fill="none" stroke="#61DAFB" stroke-width="0.7" transform="rotate(60 8 8)"/><ellipse cx="8" cy="8" rx="6" ry="2.5" fill="none" stroke="#61DAFB" stroke-width="0.7" transform="rotate(120 8 8)"/></svg>`,
  vuejs: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#35495E"/><polygon points="8,13 2,4 5,4 8,9 11,4 14,4" fill="#41B883"/><polygon points="8,10 4.5,4 6.5,4 8,7 9.5,4 11.5,4" fill="#35495E"/></svg>`,
  angularjs: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#DD0031"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Ng</text></svg>`,
  svelte: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#FF3E00"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">S</text></svg>`,
  docker: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2496ED"/><g fill="#fff"><rect x="2.5" y="7" width="2.5" height="2" rx="0.3"/><rect x="5.5" y="7" width="2.5" height="2" rx="0.3"/><rect x="8.5" y="7" width="2.5" height="2" rx="0.3"/><rect x="2.5" y="4.5" width="2.5" height="2" rx="0.3"/><rect x="5.5" y="4.5" width="2.5" height="2" rx="0.3"/><rect x="8.5" y="4.5" width="2.5" height="2" rx="0.3"/><rect x="5.5" y="2" width="2.5" height="2" rx="0.3"/></g><ellipse cx="13" cy="9" rx="1.5" ry="1" fill="#fff" opacity="0.5"/></svg>`,
  bash: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2E3436"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7.5" font-weight="bold" fill="#4EAA25">&gt;_</text></svg>`,
  postgresql: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#336791"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">pg</text></svg>`,
  mysql: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#4479A1"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#fff">SQL</text></svg>`,
  mongodb: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#47A248"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#fff">mdb</text></svg>`,
  redis: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#DC382D"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Re</text></svg>`,
  graphql: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E10098"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#fff">GQL</text></svg>`,
  markdown: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#A1A1AA">MD</text></svg>`,
};

// ---------------------------------------------------------------------------
// B) Monochrome Lucide-style icons for non-code files (16x16)
// ---------------------------------------------------------------------------

const GENERIC_ICONS: Record<string, string> = {
  chat: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  document: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  text: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>`,
  spreadsheet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  config: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  terminal: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  database: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  secure: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  pdf: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E5322D"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#fff">PDF</text></svg>`,
  word: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2B579A"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">W</text></svg>`,
  image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  json: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#F0DB4F">{}</text></svg>`,
  log: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>`,
  xml: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#F97316">&lt;/&gt;</text></svg>`,
  yaml: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#CB171E">YML</text></svg>`,
  excel: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#217346"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">X</text></svg>`,
  powerpoint: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#D24726"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">P</text></svg>`,
  code: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

export interface FileTypeInfo {
  /** The language identifier (e.g., 'javascript', 'python') */
  language: string;
  /** SVG string for the icon */
  icon: string;
  /** Human-readable label (e.g., 'JavaScript', 'Python') */
  label: string;
}

/** Extension to FileTypeInfo mapping */
const EXTENSION_MAP: Record<string, { language: string; icon: string; label: string }> = {
  // JavaScript / TypeScript
  '.js': { language: 'javascript', icon: DEVICON_ICONS.javascript, label: 'JavaScript' },
  '.mjs': { language: 'javascript', icon: DEVICON_ICONS.javascript, label: 'JavaScript' },
  '.cjs': { language: 'javascript', icon: DEVICON_ICONS.javascript, label: 'JavaScript' },
  '.jsx': { language: 'react', icon: DEVICON_ICONS.react, label: 'React JSX' },
  '.ts': { language: 'typescript', icon: DEVICON_ICONS.typescript, label: 'TypeScript' },
  '.mts': { language: 'typescript', icon: DEVICON_ICONS.typescript, label: 'TypeScript' },
  '.cts': { language: 'typescript', icon: DEVICON_ICONS.typescript, label: 'TypeScript' },
  '.tsx': { language: 'react', icon: DEVICON_ICONS.react, label: 'React TSX' },

  // Python
  '.py': { language: 'python', icon: DEVICON_ICONS.python, label: 'Python' },
  '.pyw': { language: 'python', icon: DEVICON_ICONS.python, label: 'Python' },
  '.pyi': { language: 'python', icon: DEVICON_ICONS.python, label: 'Python' },
  '.ipynb': { language: 'python', icon: DEVICON_ICONS.python, label: 'Jupyter Notebook' },

  // Java / JVM
  '.java': { language: 'java', icon: DEVICON_ICONS.java, label: 'Java' },
  '.kt': { language: 'kotlin', icon: DEVICON_ICONS.kotlin, label: 'Kotlin' },
  '.kts': { language: 'kotlin', icon: DEVICON_ICONS.kotlin, label: 'Kotlin' },

  // Systems
  '.go': { language: 'go', icon: DEVICON_ICONS.go, label: 'Go' },
  '.rs': { language: 'rust', icon: DEVICON_ICONS.rust, label: 'Rust' },
  '.c': { language: 'c', icon: DEVICON_ICONS.c, label: 'C' },
  '.h': { language: 'c', icon: DEVICON_ICONS.c, label: 'C Header' },
  '.cpp': { language: 'cplusplus', icon: DEVICON_ICONS.cplusplus, label: 'C++' },
  '.cc': { language: 'cplusplus', icon: DEVICON_ICONS.cplusplus, label: 'C++' },
  '.cxx': { language: 'cplusplus', icon: DEVICON_ICONS.cplusplus, label: 'C++' },
  '.hpp': { language: 'cplusplus', icon: DEVICON_ICONS.cplusplus, label: 'C++ Header' },
  '.cs': { language: 'csharp', icon: DEVICON_ICONS.csharp, label: 'C#' },
  '.swift': { language: 'swift', icon: DEVICON_ICONS.swift, label: 'Swift' },

  // Scripting
  '.rb': { language: 'ruby', icon: DEVICON_ICONS.ruby, label: 'Ruby' },
  '.php': { language: 'php', icon: DEVICON_ICONS.php, label: 'PHP' },
  '.sh': { language: 'bash', icon: DEVICON_ICONS.bash, label: 'Shell' },
  '.bash': { language: 'bash', icon: DEVICON_ICONS.bash, label: 'Bash' },
  '.zsh': { language: 'bash', icon: DEVICON_ICONS.bash, label: 'Zsh' },
  '.fish': { language: 'bash', icon: DEVICON_ICONS.bash, label: 'Fish' },
  '.ps1': { language: 'bash', icon: DEVICON_ICONS.bash, label: 'PowerShell' },

  // Web
  '.html': { language: 'html', icon: DEVICON_ICONS.html5, label: 'HTML' },
  '.htm': { language: 'html', icon: DEVICON_ICONS.html5, label: 'HTML' },
  '.css': { language: 'css', icon: DEVICON_ICONS.css3, label: 'CSS' },
  '.scss': { language: 'sass', icon: DEVICON_ICONS.sass, label: 'SCSS' },
  '.sass': { language: 'sass', icon: DEVICON_ICONS.sass, label: 'Sass' },
  '.less': { language: 'css', icon: DEVICON_ICONS.css3, label: 'Less' },
  '.vue': { language: 'vue', icon: DEVICON_ICONS.vuejs, label: 'Vue' },
  '.svelte': { language: 'svelte', icon: DEVICON_ICONS.svelte, label: 'Svelte' },

  // Data / Config
  '.json': { language: 'json', icon: GENERIC_ICONS.json, label: 'JSON' },
  '.jsonl': { language: 'json', icon: GENERIC_ICONS.json, label: 'JSON Lines' },
  '.xml': { language: 'xml', icon: GENERIC_ICONS.xml, label: 'XML' },
  '.yaml': { language: 'yaml', icon: GENERIC_ICONS.yaml, label: 'YAML' },
  '.yml': { language: 'yaml', icon: GENERIC_ICONS.yaml, label: 'YAML' },
  '.toml': { language: 'toml', icon: GENERIC_ICONS.config, label: 'TOML' },
  '.ini': { language: 'ini', icon: GENERIC_ICONS.config, label: 'INI' },
  '.cfg': { language: 'config', icon: GENERIC_ICONS.config, label: 'Config' },
  '.conf': { language: 'config', icon: GENERIC_ICONS.config, label: 'Config' },
  '.env': { language: 'env', icon: GENERIC_ICONS.secure, label: 'Environment' },
  '.env.local': { language: 'env', icon: GENERIC_ICONS.secure, label: 'Environment' },

  // Markdown / Text
  '.md': { language: 'markdown', icon: DEVICON_ICONS.markdown, label: 'Markdown' },
  '.mdx': { language: 'markdown', icon: DEVICON_ICONS.markdown, label: 'MDX' },
  '.txt': { language: 'text', icon: GENERIC_ICONS.text, label: 'Text' },
  '.log': { language: 'log', icon: GENERIC_ICONS.log, label: 'Log' },
  '.csv': { language: 'csv', icon: GENERIC_ICONS.spreadsheet, label: 'CSV' },
  '.tsv': { language: 'tsv', icon: GENERIC_ICONS.spreadsheet, label: 'TSV' },

  // Documents
  '.pdf': { language: 'pdf', icon: GENERIC_ICONS.pdf, label: 'PDF' },
  '.doc': { language: 'word', icon: GENERIC_ICONS.word, label: 'Word' },
  '.docx': { language: 'word', icon: GENERIC_ICONS.word, label: 'Word' },
  '.xls': { language: 'excel', icon: GENERIC_ICONS.excel, label: 'Excel' },
  '.xlsx': { language: 'excel', icon: GENERIC_ICONS.excel, label: 'Excel' },
  '.ppt': { language: 'powerpoint', icon: GENERIC_ICONS.powerpoint, label: 'PowerPoint' },
  '.pptx': { language: 'powerpoint', icon: GENERIC_ICONS.powerpoint, label: 'PowerPoint' },

  // Images
  '.png': { language: 'image', icon: GENERIC_ICONS.image, label: 'PNG Image' },
  '.jpg': { language: 'image', icon: GENERIC_ICONS.image, label: 'JPEG Image' },
  '.jpeg': { language: 'image', icon: GENERIC_ICONS.image, label: 'JPEG Image' },
  '.gif': { language: 'image', icon: GENERIC_ICONS.image, label: 'GIF Image' },
  '.svg': { language: 'xml', icon: GENERIC_ICONS.image, label: 'SVG' },
  '.webp': { language: 'image', icon: GENERIC_ICONS.image, label: 'WebP Image' },

  // DevOps / Docker
  '.dockerfile': { language: 'docker', icon: DEVICON_ICONS.docker, label: 'Dockerfile' },

  // Database
  '.sql': { language: 'sql', icon: DEVICON_ICONS.postgresql, label: 'SQL' },
  '.graphql': { language: 'graphql', icon: DEVICON_ICONS.graphql, label: 'GraphQL' },
  '.gql': { language: 'graphql', icon: DEVICON_ICONS.graphql, label: 'GraphQL' },
};

/** Special filename patterns (exact match or starts-with) */
const FILENAME_MAP: Array<{ pattern: RegExp; info: { language: string; icon: string; label: string } }> = [
  { pattern: /^Dockerfile$/i, info: { language: 'docker', icon: DEVICON_ICONS.docker, label: 'Dockerfile' } },
  { pattern: /^Makefile$/i, info: { language: 'makefile', icon: GENERIC_ICONS.terminal, label: 'Makefile' } },
  { pattern: /^Rakefile$/i, info: { language: 'ruby', icon: DEVICON_ICONS.ruby, label: 'Rakefile' } },
  { pattern: /^Gemfile$/i, info: { language: 'ruby', icon: DEVICON_ICONS.ruby, label: 'Gemfile' } },
  { pattern: /^Cargo\.toml$/i, info: { language: 'rust', icon: DEVICON_ICONS.rust, label: 'Cargo.toml' } },
  { pattern: /^go\.(mod|sum)$/i, info: { language: 'go', icon: DEVICON_ICONS.go, label: 'Go Module' } },
  { pattern: /^package\.json$/i, info: { language: 'json', icon: DEVICON_ICONS.javascript, label: 'package.json' } },
  { pattern: /^tsconfig.*\.json$/i, info: { language: 'json', icon: DEVICON_ICONS.typescript, label: 'tsconfig' } },
  { pattern: /^\.env(\..+)?$/i, info: { language: 'env', icon: GENERIC_ICONS.secure, label: 'Environment' } },
  { pattern: /^docker-compose.*\.ya?ml$/i, info: { language: 'yaml', icon: DEVICON_ICONS.docker, label: 'Docker Compose' } },
  { pattern: /^requirements.*\.txt$/i, info: { language: 'text', icon: DEVICON_ICONS.python, label: 'Requirements' } },
  { pattern: /^angular\.json$/i, info: { language: 'json', icon: DEVICON_ICONS.angularjs, label: 'Angular Config' } },
];

/**
 * Detect file type from a filename and return icon, language, and label.
 *
 * @param filename - The filename (or null for text chat input)
 * @param isTextChat - True when this is direct AI text input (no file)
 * @returns FileTypeInfo with language, icon SVG string, and label
 */
export function detectFileType(filename: string | null, isTextChat: boolean): FileTypeInfo {
  // Text chat input (no file)
  if (!filename || isTextChat) {
    return {
      language: 'text',
      icon: GENERIC_ICONS.chat,
      label: 'AI Text Input',
    };
  }

  // Check special filename patterns first
  const baseName = filename.split('/').pop() || filename;
  for (const { pattern, info } of FILENAME_MAP) {
    if (pattern.test(baseName)) {
      return info;
    }
  }

  // Check by extension (try longest match first for compound extensions like .env.local)
  const lowerName = baseName.toLowerCase();
  // Try compound extensions first
  const compoundExtMatch = lowerName.match(/(\.[^.]+\.[^.]+)$/);
  if (compoundExtMatch && EXTENSION_MAP[compoundExtMatch[1]]) {
    return EXTENSION_MAP[compoundExtMatch[1]];
  }

  // Try simple extension
  const extMatch = lowerName.match(/(\.[^.]+)$/);
  if (extMatch && EXTENSION_MAP[extMatch[1]]) {
    return EXTENSION_MAP[extMatch[1]];
  }

  // Fallback: generic document icon
  return {
    language: 'text',
    icon: GENERIC_ICONS.document,
    label: baseName,
  };
}

/**
 * Get a generic icon by name.
 */
export function getGenericIcon(name: keyof typeof GENERIC_ICONS): string {
  return GENERIC_ICONS[name] || GENERIC_ICONS.document;
}

/**
 * Get a devicon language icon by name.
 */
export function getDeviconIcon(name: string): string | null {
  return DEVICON_ICONS[name] || null;
}
