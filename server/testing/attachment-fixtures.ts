import { zipSync,strToU8 } from "fflate";
export const officeKinds={xlsx:{part:"xl/workbook.xml",type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",body:'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>'},docx:{part:"word/document.xml",type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",body:'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Development inspection document</w:t></w:r></w:p></w:body></w:document>'},pptx:{part:"ppt/presentation.xml",type:"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",body:'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>'}} as const;
export function officeFixture(kind:keyof typeof officeKinds,extra:Record<string,Uint8Array>={}){
 const v=officeKinds[kind];return Buffer.from(zipSync({
  "[Content_Types].xml":strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${v.part}" ContentType="${v.type}"/></Types>`),
  "_rels/.rels":strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${v.part}"/></Relationships>`),
  [v.part]:strToU8(v.body),...extra
 },{level:6}));
}
