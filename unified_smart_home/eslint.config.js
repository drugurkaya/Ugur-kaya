// Statik analiz: tanımsız değişkenler, kullanılmayan kod ve tehlikeli kalıplar.
export default [
  {
    files: ['app/js/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', location: 'readonly', history: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', indexedDB: 'readonly', crypto: 'readonly', fetch: 'readonly', WebSocket: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', Node: 'readonly', CustomEvent: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly', Intl: 'readonly', requestAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', setImmediate: 'readonly',
        console: 'readonly', globalThis: 'readonly', structuredClone: 'readonly', Response: 'readonly', process: 'readonly',
        self: 'readonly', caches: 'readonly', Event: 'readonly', getComputedStyle: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-unsafe-finally': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
];
