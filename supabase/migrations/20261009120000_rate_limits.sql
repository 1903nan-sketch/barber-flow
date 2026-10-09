-- Rate limit por IP na API do Supabase (PostgREST) e nas rotas /api do Next.
--
-- PostgREST chama ratelimit.check_request() antes de cada requisição. Só dá
-- para contar requisições que escrevem: GET/HEAD e funções STABLE rodam em
-- transação somente leitura. service_role (o servidor) não tem limite.
-- Qualquer erro interno libera a requisição, para o limite nunca derrubar o app.
--
-- Para desligar:
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';

create schema if not exists ratelimit;
revoke all on schema ratelimit from public;
grant usage on schema ratelimit to anon, authenticated, service_role;

-- Uma linha por (chave, janela). UNLOGGED: contadores não precisam sobreviver a um crash.
create unlogged table if not exists ratelimit.counters (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
revoke all on table ratelimit.counters from public, anon, authenticated, service_role;

-- Soma 1 na janela atual da chave e diz se ainda está dentro do limite.
create or replace function ratelimit.hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into ratelimit.counters as c (bucket, window_start, hits)
  values (left(p_bucket, 200), w, 1)
  on conflict (bucket, window_start) do update set hits = c.hits + 1
  returning c.hits into n;
  return n <= p_limit;
end $$;
revoke all on function ratelimit.hit(text, integer, integer) from public, anon, authenticated, service_role;

create or replace function ratelimit.check_request()
returns void language plpgsql security definer set search_path = '' as $$
declare
  req_method text := current_setting('request.method', true);
  req_path text := coalesce(current_setting('request.path', true), '');
  headers json;
  req_role text;
  ip text;
  allowed boolean := true;
begin
  if req_method is null or req_method in ('GET', 'HEAD', 'OPTIONS')
     or current_setting('transaction_read_only') = 'on' then
    return;
  end if;

  begin
    req_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
                         current_setting('role', true));
    if req_role is distinct from 'anon' and req_role is distinct from 'authenticated' then
      return;
    end if;

    headers := nullif(current_setting('request.headers', true), '')::json;
    ip := coalesce(nullif(headers ->> 'cf-connecting-ip', ''),
                   nullif(trim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''),
                   nullif(headers ->> 'x-real-ip', ''));
    if ip is null then
      return;
    end if;

    if req_role = 'anon' then
      -- Agendamento público: 10 reservas a cada 10 minutos por IP.
      if req_path like '%rpc/public_book%' then
        allowed := ratelimit.hit('anon-book:' || ip, 10, 600);
      end if;
      -- Qualquer escrita sem login: 60 por minuto por IP.
      allowed := ratelimit.hit('anon:' || ip, 60, 60) and allowed;
    else
      -- Usuários logados (equipe da barbearia, às vezes no mesmo IP): 600 por minuto.
      allowed := ratelimit.hit('auth:' || ip, 600, 60);
    end if;
  exception when others then
    return;
  end;

  if not allowed then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'RATE_LIMIT',
        'message', 'Muitas requisições. Aguarde um minuto e tente novamente.')::text,
      detail = json_build_object(
        'status', 429,
        'status_text', 'Too Many Requests',
        'headers', json_build_object('Retry-After', '60'))::text;
  end if;
end $$;
revoke all on function ratelimit.check_request() from public;
grant execute on function ratelimit.check_request() to anon, authenticated, service_role;

-- Usado pelo middleware do Next (rotas /api), só com a chave service_role.
create or replace function public.api_rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language sql security definer set search_path = '' as $$
  select ratelimit.hit('api:' || p_bucket, p_limit, p_window_seconds);
$$;
revoke all on function public.api_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_limit_hit(text, integer, integer) to service_role;

-- Limpa janelas antigas a cada 10 minutos.
select cron.unschedule(jobid) from cron.job where jobname = 'ratelimit-cleanup';
select cron.schedule('ratelimit-cleanup', '*/10 * * * *',
  $$delete from ratelimit.counters where window_start < now() - interval '1 hour'$$);

alter role authenticator set pgrst.db_pre_request = 'ratelimit.check_request';
notify pgrst, 'reload config';
