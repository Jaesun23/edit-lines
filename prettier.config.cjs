/** @type {import("prettier").Config} */
const config = {
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  trailingComma: "none",
  importOrderTypeScriptVersion: "5.0.0",
};

module.exports = config;
