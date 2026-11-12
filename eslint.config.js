// The lint check (2026-11-12, D78): mistakes a reader can see without running the code. Rules for bugs only, never
// formatting or taste: a name that doesn't exist, a name never used, one name hiding another, a key or case written
// twice, code that can't run, a comparison that is always the same. Run by tools/lint.js (tests/run.sh and CI), which
// checks the app as the iPad gets it (js/app.js, the parts joined) and names the part each finding is in.
// ESLint is a test tool only (package.json); nothing here reaches the iPads.
const js = require('@eslint/js');
const globals = require('globals');

const bugs = {
  ...js.configs.recommended.rules,
  // taste, not bugs: left out
  'no-empty': 'off', 'no-useless-escape': 'off', 'no-prototype-builtins': 'off', 'no-control-regex': 'off', 'no-misleading-character-class': 'off',
  // intended patterns or false alarms here (first pass, 2026-11-12): "start empty, then try to read" defaults; a loop whose
  // value changes in a callback the rule can't see; runs of spaces a test matches on purpose
  'no-useless-assignment': 'off', 'no-unmodified-loop-condition': 'off', 'no-regex-spaces': 'off',
  'no-constant-condition': ['error', { checkLoops: false }],   // for (;;) and while (true) are deliberate
  'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }],
  'no-shadow': ['error', { builtinGlobals: false, hoist: 'functions' }],
  'no-self-compare': 'error', 'no-template-curly-in-string': 'error', 'no-unreachable-loop': 'error',
  'no-use-before-define': ['error', { functions: false, classes: true, variables: false }],
};

module.exports = [
  { ignores: ['js/vendor/**', 'js/src/**', 'node_modules/**', 'tests/out/**'] },
  {   // the app: one function, in the browser, with the two star-and-satellite libraries it loads
    files: ['js/app.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...globals.serviceworker, Astronomy: 'readonly', satellite: 'readonly' } },
    rules: bugs,
  },
  {   // the Google bridge: Apps Script, whose top-level functions are called by Google (doGet, doPost, setup, triggers)
    files: ['apps-script/Code.gs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { UrlFetchApp: 'readonly', PropertiesService: 'readonly', CacheService: 'readonly', ContentService: 'readonly',
      Utilities: 'readonly', Session: 'readonly', LockService: 'readonly', CalendarApp: 'readonly', ScriptApp: 'readonly', Logger: 'readonly', console: 'readonly' } },
    rules: { ...bugs, 'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }] },
  },
  {   // the tests and tools: Node, plus the page code they hand to the browser (page.evaluate)
    files: ['tests/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: bugs,
  },
];
