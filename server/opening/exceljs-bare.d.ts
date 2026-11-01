declare module "exceljs/dist/exceljs.bare.js" {
  const reader: typeof import("exceljs");
  export default reader;
}
