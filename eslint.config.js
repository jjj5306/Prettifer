import eslint from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const restrictedCoreImports = [
  {
    name: "vscode",
    message: "The core must remain independent from editor APIs.",
  },
];

export default tseslint.config(
  {
    ignores: [
      ".webpack/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "out/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-restricted-imports": ["error", { paths: restrictedCoreImports }],
    },
  },
  {
    files: ["src/desktop/renderer/**/*.{ts,tsx}"],
    plugins: {
      "jsx-a11y": jsxA11y,
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.flat["recommended-latest"].rules,
      ...jsxA11y.flatConfigs.strict.rules,
      "react/no-array-index-key": "error",
      "react/no-danger": "error",
      "react/prop-types": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...restrictedCoreImports,
            {
              name: "electron",
              message: "Renderer code must use the typed preload API.",
            },
          ],
          patterns: [
            {
              group: [
                "node:*",
                "../composition/**",
                "../../composition/**",
                "../../../composition/**",
                "../git/**",
                "../../git/**",
                "../../../git/**",
                "../history/**",
                "../../history/**",
                "../../../history/**",
                "../main/**",
                "../../main/**",
                "../../../main/**",
                "../preload/**",
                "../../preload/**",
                "../../../preload/**",
              ],
              message: "Renderer code must stay behind the desktop API boundary.",
            },
          ],
        },
      ],
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    files: ["src/desktop/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...restrictedCoreImports,
            { name: "electron", message: "Shared contracts must be runtime-neutral." },
            { name: "react", message: "Shared contracts must be runtime-neutral." },
          ],
          patterns: [
            {
              group: ["node:*", "**/main/**", "**/preload/**", "**/renderer/**"],
              message: "Shared contracts must be runtime-neutral.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/desktop/main/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedCoreImports,
          patterns: [
            {
              group: ["**/preload/**", "**/renderer/**"],
              message: "Main code must not import preload or renderer modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/desktop/preload/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedCoreImports,
          patterns: [
            {
              group: [
                "node:*",
                "**/composition/**",
                "**/git/**",
                "**/history/**",
                "**/main/**",
                "**/renderer/**",
              ],
              message: "Preload code may import only Electron and shared contracts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  {
    files: ["examples/**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["*.config.{js,cjs}", "webpack.*.cjs", "forge.config.cjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
