module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  plugins: ["@typescript-eslint", "mocha"],
  extends: [
    "standard",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    "node/no-unsupported-features/es-syntax": ["error", { ignores: ["modules"] }],
    "mocha/no-exclusive-tests": "error",
    "@typescript-eslint/no-var-requires": 0,
  },
  node: {
    resolvePaths: ["node_modules/@types"],
    tryExtensions: [".js", ".json", ".node", ".ts", ".d.ts"],
  },
};
