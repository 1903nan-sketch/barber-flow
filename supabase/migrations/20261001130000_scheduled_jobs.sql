-- BarberTix · Rotinas agendadas
-- pg_cron executa diretamente no banco: liberação de horários com sinal vencido e
-- atualização do status das assinaturas. A cada 5 minutos o banco chama
-- /api/cron/run (pg_net) para enviar confirmações, lembretes, avisos de vencimento
-- e continuar campanhas. O segredo fica em platform_settings (sem acesso do navegador).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

insert into public.platform_settings(key,value) values ('cron_secret',encode(extensions.gen_random_bytes(24),'hex'))
on conflict (key) do nothing;
insert into public.platform_settings(key,value) values ('app_base_url','https://barbertix.3ruptix.com')
on conflict (key) do nothing;

create or replace function private.call_automation_runner()
returns bigint language plpgsql security definer set search_path='' as $$
declare base text; secret text; rid bigint;
begin
  select value into base from public.platform_settings where key='app_base_url';
  select value into secret from public.platform_settings where key='cron_secret';
  if coalesce(base,'')='' or coalesce(secret,'')='' then return null; end if;
  select net.http_post(
    url:=rtrim(base,'/')||'/api/cron/run',
    body:='{}'::jsonb,
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),
    timeout_milliseconds:=55000
  ) into rid;
  return rid;
end $$;
revoke all on function private.call_automation_runner() from public;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in ('barbertix-expire-deposit-holds','barbertix-billing-sync','barbertix-automation-runner') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule('barbertix-expire-deposit-holds','* * * * *',$cron$select private.expire_deposit_holds()$cron$);
select cron.schedule('barbertix-billing-sync','*/15 * * * *',$cron$select private.run_billing_sync(null)$cron$);
select cron.schedule('barbertix-automation-runner','*/5 * * * *',$cron$select private.call_automation_runner()$cron$);

-- Endurecimento: funções de gatilho/relatório não precisam ser executáveis via API anônima.
revoke execute on function public.auto_link_new_service_to_barbers() from public,anon,authenticated;
revoke execute on function public.admin_report_for_product(text,text) from public,anon;
