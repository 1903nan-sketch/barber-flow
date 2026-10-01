import {NextResponse} from "next/server";
import {adminClient,jsonError,planAllows,requireMember} from "../../../../lib/server-auth";
import {runCampaignBatch} from "../../../../lib/automation";
import {getPlatformSetting} from "../../../../lib/whatsapp-send";

export const maxDuration=60;

// Envia o próximo lote de uma campanha criada por create_campaign. A tela chama em
// sequência até zerar; o cron também continua campanhas interrompidas.
export async function POST(request){
 try{
  const body=await request.json(),tenantId=String(body.tenant_id||""),campaignId=String(body.campaign_id||"");
  const ctx=await requireMember(request,tenantId,{permission:"clients"});
  if(!planAllows(ctx.tenant,"marketing"))return NextResponse.json({error:"Campanhas estão disponíveis a partir do plano Pro."},{status:403});
  const admin=adminClient();
  const {data:campaign}=await admin.from("marketing_campaigns").select("id,tenant_id,status").eq("id",campaignId).eq("tenant_id",tenantId).maybeSingle();
  if(!campaign)return NextResponse.json({error:"Campanha não encontrada."},{status:404});
  const origin=(process.env.NEXT_PUBLIC_APP_URL||await getPlatformSetting(admin,"app_base_url")||new URL(request.url).origin).replace(/\/+$/,"");
  const result=campaign.status==="sending"?await runCampaignBatch(admin,campaignId,{origin,deadline:Date.now()+40000,limit:8}):{sent:0,failed:0,claimed:0};
  const {data:fresh}=await admin.from("marketing_campaigns").select("status,recipients_count,sent_count,failed_count").eq("id",campaignId).maybeSingle();
  const {count:pending}=await admin.from("campaign_recipients").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).in("status",["pending","sending"]);
  return NextResponse.json({...result,campaign:fresh,pending:Number(pending||0)});
 }catch(error){return jsonError(error,"Não foi possível enviar a campanha.")}
}
