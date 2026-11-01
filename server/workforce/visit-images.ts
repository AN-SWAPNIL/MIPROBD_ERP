import sharp from "sharp";
import { createHash } from "node:crypto";
import { HttpError } from "../foundation/errors.js";

export async function validateVisitImage(bytes:Buffer,mime:string){
  if(bytes.length>300*1024)throw new HttpError(422,"Visit photos must be no larger than 300 KB.");
  try{
    const image=sharp(bytes,{limitInputPixels:4_000_000,failOn:"warning"});const meta=await image.metadata();
    if(!meta.width||!meta.height||Math.min(meta.width,meta.height)<16||Math.max(meta.width,meta.height)>1920||(meta.pages??1)>1||!({jpeg:"image/jpeg",png:"image/png",webp:"image/webp"} as Record<string,string>)[meta.format??""]||({jpeg:"image/jpeg",png:"image/png",webp:"image/webp"} as Record<string,string>)[meta.format!]!==mime)throw new Error("Invalid image");
    await image.raw().toBuffer();
    return {width:meta.width,height:meta.height,sha256:createHash("sha256").update(bytes).digest("hex")};
  }catch{throw new HttpError(422,"Use a decodable JPEG, PNG or WebP photo, 16-1920 px per side, without animation.");}
}
