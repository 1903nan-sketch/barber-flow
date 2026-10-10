"use client";
// Foto do celular costuma ter 3–8 MB (e às vezes vem em HEIC). Antes de enviar,
// reduzimos no próprio navegador para no máximo `max` px no maior lado, em WebP
// (ou JPEG quando o navegador não gera WebP). Assim o envio fica leve, rápido e
// sempre abaixo do limite do servidor.
const OK_TYPES=["image/jpeg","image/png","image/webp"];

async function decode(file){
 if("createImageBitmap" in window){
  try{return await createImageBitmap(file,{imageOrientation:"from-image"})}catch{}
 }
 return await new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("decode"))};
  img.src=url;
 });
}

export async function prepareImage(file,{max=1600,quality=.86}={}){
 if(!file)throw new Error("Escolha uma imagem.");
 if(!String(file.type||"").startsWith("image/")&&!/\.(heic|heif)$/i.test(file.name||""))throw new Error("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
 let img;
 try{img=await decode(file)}catch{
  if(OK_TYPES.includes(file.type)&&file.size<=4*1024*1024)return file;
  throw new Error("Não foi possível abrir esta imagem. Envie em JPG, PNG ou WebP.");
 }
 const w=img.width||img.naturalWidth,h=img.height||img.naturalHeight;
 // Já é leve e num formato aceito: envia como está.
 if(OK_TYPES.includes(file.type)&&file.size<=1.5*1024*1024&&Math.max(w,h)<=max)return file;
 const scale=Math.min(1,max/Math.max(w,h)),canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
 canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
 img.close?.();
 const blob=await new Promise(r=>canvas.toBlob(r,"image/webp",quality));
 const out=blob&&blob.type==="image/webp"?blob:await new Promise(r=>canvas.toBlob(r,"image/jpeg",quality));
 if(!out)throw new Error("Não foi possível preparar a imagem. Tente outra foto.");
 const ext=out.type==="image/webp"?"webp":"jpg",name=String(file.name||"foto").replace(/\.[^.]+$/,"")+"."+ext;
 return new File([out],name,{type:out.type});
}

// Envia logo, capa ou foto de profissional (já reduzida) e devolve a URL pública.
export async function uploadMedia(supabase,tenantId,field,file){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw new Error("Sessão expirada. Entre novamente.");
 const ready=await prepareImage(file,{max:field==="cover_url"?2000:1200});
 const body=new FormData();body.append("file",ready);body.append("tenant_id",tenantId);body.append("field",field);
 const res=await fetch("/api/media/upload",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`},body});
 const out=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(out.error||(res.status===413?"A imagem é grande demais. Tente outra foto.":"Não foi possível enviar a imagem."));
 return out.url;
}
