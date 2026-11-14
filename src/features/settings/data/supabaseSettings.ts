import type { SupabaseClient } from '@supabase/supabase-js';
import { SettingsRejected } from '../application/settingsGateway';
import type { SettingsGateway } from '../application/settingsGateway';
import {
  DEFAULT_SETTINGS,
  knownSettingsMessage,
  settingsSchema,
} from '../domain/settings';

const COLUMNS =
  'production_registrar,production_window_minutes,unlabeled_limit_minutes,portion_expiry_rule';

export function createSettingsGateway(client: SupabaseClient): SettingsGateway {
  return {
    async get(scope) {
      const { data, error } = await client
        .from('establishment_settings')
        .select(COLUMNS)
        .eq('organization_id', scope.organizationId)
        .eq('establishment_id', scope.establishmentId)
        .maybeSingle();
      if (error)
        throw new Error(
          'Não foi possível consultar as configurações da unidade.',
        );
      return data ? settingsSchema.parse(data) : DEFAULT_SETTINGS;
    },
    async save(scope, settings) {
      const v = settingsSchema.parse(settings);
      const { data, error } = await client.rpc('set_establishment_settings', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_production_registrar: v.production_registrar,
        p_production_window_minutes: v.production_window_minutes,
        p_unlabeled_limit_minutes: v.unlabeled_limit_minutes,
        p_portion_expiry_rule: v.portion_expiry_rule,
      });
      if (error) {
        const known = knownSettingsMessage(error.message);
        if (known) throw new SettingsRejected(known);
        if (error.code === '42501')
          throw new SettingsRejected(
            'Somente o proprietário muda as configurações da unidade.',
          );
        if (error.code)
          throw new SettingsRejected(
            'Não foi possível salvar. Confira os valores.',
          );
        throw new Error(
          'Não foi possível confirmar o salvamento. Atualize a tela e confira as configurações.',
        );
      }
      return settingsSchema.parse(
        Array.isArray(data) ? (data as unknown[])[0] : data,
      );
    },
  };
}
