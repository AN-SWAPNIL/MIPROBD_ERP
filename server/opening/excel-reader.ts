// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- Vercel compiles the API separately and must load this vendor declaration.
/// <reference path="./exceljs-bare.d.ts" />
import reader from "exceljs/dist/exceljs.bare.js";

// Only buffered XLSX reading is needed. The supported browser build omits the
// filesystem/streaming writer and its legacy archiver/glob dependency chain.
export default reader;
