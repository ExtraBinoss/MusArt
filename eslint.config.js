import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "coverage/**",
      "artifacts/**",
      "third_party/clone/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: ts.parser },
    plugins: { "react-hooks": hooks },
    rules: hooks.configs["recommended-latest"].rules,
  },
];
