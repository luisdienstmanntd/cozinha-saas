-- Reverte 20261118000000_hosted_provisioning.sql. Só remove as funções administrativas e o marcador; não toca
-- em empresas, unidades, vínculos ou histórico criados com elas. Em ambiente declarado "producao" o marcador
-- é protegido: o DROP TABLE abaixo não é bloqueado por gatilho, mas NÃO faça isto em produção sem decisão de luis.
drop function if exists private.reset_test_environment(text, text);
drop function if exists private.add_member_to_organization(uuid, text, text, text);
drop function if exists private.bootstrap_owner_organization(text, text, text, text, text);
drop function if exists private.find_confirmed_user(text);
drop function if exists private.declare_environment(text);
drop function if exists private.assert_admin_session();
drop table if exists private.environment_marker;
drop function if exists private.protect_environment_marker();
