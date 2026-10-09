-- O RupControl atende qualquer ramo: mensagens das funções deixam de falar em
-- "barbearia". Só troca textos (mensagens de erro e o prefixo de slug gerado
-- quando o nome não começa com letra); a lógica das funções não muda.
do $$
declare
  r record;
  def text;
  newdef text;
begin
  for r in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ '[Bb]arbearia'
  loop
    def := pg_get_functiondef(r.oid);
    newdef := def;
    newdef := replace(newdef, 'Este plano está sendo usado por uma barbearia', 'Este plano está sendo usado por uma empresa');
    newdef := replace(newdef, 'Barbearia não encontrada', 'Empresa não encontrada');
    newdef := replace(newdef, 'Barbearia indisponível para agendamento', 'Agenda indisponível para agendamento');
    newdef := replace(newdef, 'pode configurar a barbearia', 'pode configurar a empresa');
    newdef := replace(newdef, 'gateway de sinal da barbearia', 'gateway de sinal da empresa');
    newdef := replace(newdef, 'Este usuário já possui uma barbearia', 'Este usuário já possui uma empresa');
    newdef := replace(newdef, 'Informe o nome da barbearia', 'Informe o nome da empresa');
    newdef := replace(newdef, '''barbearia-''', '''agenda-''');
    if newdef <> def then
      execute newdef;
    end if;
  end loop;
end $$;
