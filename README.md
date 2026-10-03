# Barber Flow

Sistema SaaS para gestão de barbearias.


## Agente de IA do WhatsApp

Para habilitar o agente de agendamento com OpenAI, configure no servidor/Vercel:

```env
OPENAI_API_KEY=...
OPENAI_WHATSAPP_MODEL=gpt-5.6-luna
```

`OPENAI_WHATSAPP_MODEL` é opcional; o padrão é `gpt-5.6-luna`. Sem `OPENAI_API_KEY`, o fluxo legado do WhatsApp continua funcionando como fallback.
