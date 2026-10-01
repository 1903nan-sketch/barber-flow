"use client";

// Rastreamento de aquisição: guarda o primeiro toque (first-touch) e o último toque com
// parâmetros de campanha. IDs de clique e cookies de pixel ficam prontos para
// integrações server-side futuras (Google Ads, Meta CAPI, TikTok etc.).
const KEY="bt_acquisition_v1";
const UTM=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
const CLICK_IDS=["gclid","gbraid","wbraid","fbclid","ttclid","msclkid","li_fat_id","twclid","sccid"];

function read(){try{return JSON.parse(localStorage.getItem(KEY)||"null")}catch{return null}}
function write(value){try{localStorage.setItem(KEY,JSON.stringify(value))}catch{}}
const clip=(v,n=200)=>String(v||"").slice(0,n);
function cookie(name){
 try{return decodeURIComponent(document.cookie.split("; ").find(x=>x.startsWith(name+"="))?.split("=").slice(1).join("=")||"")}catch{return ""}
}

export function captureAcquisition(){
 if(typeof window==="undefined")return;
 const params=new URLSearchParams(window.location.search);
 const touch={},clicks={};
 for(const k of UTM)if(params.get(k))touch[k]=clip(params.get(k));
 for(const k of CLICK_IDS)if(params.get(k))clicks[k]=clip(params.get(k),300);
 const hasCampaign=Object.keys(touch).length>0||Object.keys(clicks).length>0;
 const now=new Date().toISOString();
 const current=read();
 if(!current){
  write({
   ...touch,
   click_ids:clicks,
   landing_page:clip(window.location.pathname+window.location.search,500),
   referrer:clip(document.referrer,500),
   first_touch_at:now,
   last_touch:hasCampaign?{...touch,click_ids:clicks,at:now,page:clip(window.location.pathname,200)}:{}
  });
  return;
 }
 if(hasCampaign){
  write({...current,click_ids:{...(current.click_ids||{}),...clicks},last_touch:{...touch,click_ids:clicks,at:now,page:clip(window.location.pathname,200)}});
 }
}

export function getAcquisition(){
 const data=read()||{};
 const click_ids={...(data.click_ids||{})};
 const fbp=cookie("_fbp"),fbc=cookie("_fbc");
 if(fbp)click_ids._fbp=clip(fbp,300);
 if(fbc)click_ids._fbc=clip(fbc,300);
 return {...data,click_ids};
}
