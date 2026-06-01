import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // exhaustive-deps stays at "warn" (Next's default). The violations are
      // surfaced for review, but auto-adding dependencies to existing hooks can
      // introduce render loops, so they should be triaged case-by-case rather
      // than silenced or blindly "fixed".
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

export default eslintConfig;
