import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "http://localhost:8000/openapi.json",
  output: "src/api",
  exportCore: false,
  plugins: ["@hey-api/client-axios"],
});
