export const officeMimes = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
} as const;
export const attachmentMimes = ["image/jpeg", "image/png", "image/webp", "application/pdf", officeMimes.xlsx, officeMimes.docx, officeMimes.pptx, "text/csv", "text/plain"] as const;
export const attachmentAccept = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx,.pptx,.csv,.txt";
const byExtension: Record<string,string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", ...officeMimes, csv: "text/csv", txt: "text/plain" };
export function attachmentMime(fileName:string,reportedMime:string,legacyGif=false) {
  if(/[\\/\u202a-\u202e\u2066-\u2069]/.test(fileName)||[...fileName].some(c=>c.charCodeAt(0)<32))throw new Error("Invalid attachment file name.");
  const dot=fileName.lastIndexOf("."),extension=dot>0?fileName.slice(dot+1).toLowerCase():"",expected=Object.hasOwn(byExtension,extension)?byExtension[extension]:legacyGif&&extension==="gif"?"image/gif":undefined;
  if (!expected) throw new Error(["xls","doc","ppt"].includes(extension)?"Save legacy Office files as XLSX, DOCX or PPTX before attaching them.":"Select a PDF, image, XLSX, DOCX, PPTX, CSV or TXT file.");
  const reported=reportedMime.split(";")[0].trim().toLowerCase();
  if(reported&&reported!==expected&&!["application/octet-stream","application/zip"].includes(reported)&&!(extension==="csv"&&["application/vnd.ms-excel","text/plain"].includes(reported)))throw new Error("File extension and reported type do not match.");
  return expected;
}
export function attachmentMetadataMatches(fileName:string,mime:string){try{return attachmentMime(fileName,mime)===mime;}catch{return false;}}
export function hasDocumentPreview(mime:string){return mime==="application/pdf"||["image/jpeg","image/png","image/webp","image/gif"].includes(mime);}
export function attachmentLabel(mime:string){return mime===officeMimes.xlsx?"Excel Workbook":mime===officeMimes.docx?"Word Document":mime===officeMimes.pptx?"PowerPoint Presentation":mime==="text/csv"?"CSV File":mime==="text/plain"?"Text File":"Document";}
