import {FlatCompat} from "@eslint/eslintrc";
import js from "@eslint/js";
import path from "node:path";
import {fileURLToPath} from "node:url";

const directory=path.dirname(fileURLToPath(import.meta.url));
const compat=new FlatCompat({baseDirectory:directory});

export default [
  {ignores:[".next/**","node_modules/**"]},
  js.configs.recommended,
  ...compat.extends("next/core-web-vitals"),
  {
    rules:{
      "no-empty":"off",
      "no-unused-vars":"warn",
      "no-useless-escape":"off",
    },
  },
];
