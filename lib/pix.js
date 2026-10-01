// Gera o "PIX Copia e Cola" (BR Code estático) a partir da chave da barbearia.
const field=(id,value)=>id+String(value.length).padStart(2,"0")+value;
const clean=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9 .-]/g,"").toUpperCase();

function crc16(s){
 let crc=0xffff;
 for(let i=0;i<s.length;i++){
  crc^=s.charCodeAt(i)<<8;
  for(let j=0;j<8;j++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;
  crc&=0xffff;
 }
 return crc.toString(16).toUpperCase().padStart(4,"0");
}

export function makePixPayload({key,name,city,amountCents,txid="***",description=""}){
 if(!key)return "";
 const merchant=field("00","BR.GOV.BCB.PIX")+field("01",String(key).trim())+(description?field("02",clean(description).slice(0,40)):"");
 const ref=clean(txid).replace(/[^A-Z0-9]/g,"").slice(0,25)||"***";
 const base=field("00","01")+field("26",merchant)+field("52","0000")+field("53","986")+
  (amountCents?field("54",(Number(amountCents)/100).toFixed(2)):"")+field("58","BR")+
  field("59",clean(name).slice(0,25)||"BARBEARIA")+field("60",clean(city).slice(0,15)||"SAO PAULO")+field("62",field("05",ref))+"6304";
 return base+crc16(base);
}
