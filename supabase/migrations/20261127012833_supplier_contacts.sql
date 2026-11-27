-- Campos opcionais. RLS e histórico de fornecedores permanecem intactos.
alter table public.suppliers
  add column email text,
  add column contact text,
  add constraint suppliers_email_check check (email is null or (
    char_length(email) between 3 and 254 and email = btrim(email, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
  add constraint suppliers_contact_check check (contact is null or (
    char_length(contact) between 1 and 80 and contact = btrim(contact, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')));
grant insert (email, contact) on public.suppliers to authenticated;
-- Reversão antes de uso: revoke insert (email, contact) ...; remover constraints e colunas.
-- Após uso, exportar os contatos antes de reverter para não perder dados.
