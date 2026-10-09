# RupControl

Sistema SaaS da Ruptix para gestão de barbearias. O mesmo projeto serve a página institucional (`3ruptix.com`) e o sistema (`rupcontrol.3ruptix.com`).

## Domínio

O endereço do sistema fica em `lib/site.js`. Os domínios antigos (`barbertix.3ruptix.com`, `barberflow.3ruptix.com`) continuam ligados ao projeto na Vercel: o `middleware.js` manda as páginas abertas por eles para o domínio novo e deixa as rotas `/api` respondendo, porque webhooks do WhatsApp e do Asaas ainda podem apontar para lá. Não use o redirecionamento de domínio da própria Vercel, que também redirecionaria os webhooks.

## Limite de requisições

- **API do Supabase:** `ratelimit.check_request()` roda antes de cada requisição que escreve (migração `20261009120000_rate_limits.sql`). Por IP: 10 agendamentos públicos a cada 10 minutos, 60 escritas sem login por minuto e 600 escritas de usuários logados por minuto. Leituras e o `service_role` não contam. Acima do limite a API responde 429.
- **Rotas `/api` do Next:** o `middleware.js` conta por IP em `public.api_rate_limit_hit` (webhooks 600/min, admin 60/min, agendamentos 20/min, upload e Instagram 30/min, demais 120/min).
- Os dois liberam a requisição se o contador falhar. Para desligar o do Supabase: `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`


## Agente de IA do WhatsApp

Para habilitar o agente de agendamento com OpenAI, configure no servidor/Vercel:

```env
OPENAI_API_KEY=...
OPENAI_WHATSAPP_MODEL=gpt-5.6-luna
```

`OPENAI_WHATSAPP_MODEL` é opcional; o padrão é `gpt-5.6-luna`. Sem `OPENAI_API_KEY`, o fluxo legado do WhatsApp continua funcionando como fallback.
