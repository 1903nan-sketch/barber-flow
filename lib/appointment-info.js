// Monta os dados de um agendamento para mensagens (consultas separadas: appointments não
// possui FK direta para barbers/units/tenants, então não usamos embedding do PostgREST).
export async function loadAppointmentInfo(admin,tenantId,appointmentId){
 const {data:a}=await admin.from("appointments")
  .select("id,tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,deposit_status,deposit_cents")
  .eq("tenant_id",tenantId).eq("id",appointmentId).maybeSingle();
 if(!a)return null;
 const [{data:tenant},{data:client},{data:barber},{data:unit},{data:lines}]=await Promise.all([
  admin.from("tenants").select("id,name,slug,address,whatsapp,phone").eq("id",tenantId).maybeSingle(),
  admin.from("clients").select("id,name,phone,whatsapp").eq("tenant_id",tenantId).eq("id",a.client_id).maybeSingle(),
  admin.from("barbers").select("id,name").eq("tenant_id",tenantId).eq("id",a.barber_id).maybeSingle(),
  admin.from("units").select("id,name,timezone").eq("tenant_id",tenantId).eq("id",a.unit_id).maybeSingle(),
  admin.from("appointment_services").select("services(name)").eq("tenant_id",tenantId).eq("appointment_id",a.id)
 ]);
 let services=(lines||[]).map(x=>x.services?.name).filter(Boolean).join(" + ");
 if(!services&&a.service_id){const {data:s}=await admin.from("services").select("name").eq("id",a.service_id).maybeSingle();services=s?.name||""}
 return {appointment:a,tenant,client,barber,unit,services:services||"Atendimento",timezone:unit?.timezone||"America/Sao_Paulo"};
}
