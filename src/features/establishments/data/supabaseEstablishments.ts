import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EstablishmentRejected,
  EstablishmentUncertain,
} from '../application/establishmentGateway';
import type { EstablishmentGateway } from '../application/establishmentGateway';
import {
  parseEstablishmentName,
  parseNewEstablishment,
} from '../domain/establishment';

const uncertain =
  'Não foi possível confirmar a criação da unidade. A lista foi atualizada: confira se ela já aparece antes de tentar novamente.';

// PostgreSQL SQLSTATE (5 chars) or PostgREST codes mean the server answered.
function answeredByServer(code: unknown) {
  return (
    typeof code === 'string' &&
    (/^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST'))
  );
}

export function createEstablishmentGateway(
  client: SupabaseClient,
): EstablishmentGateway {
  return {
    async create(organizationId, input) {
      const values = parseNewEstablishment(input.name, input.timezone);
      let result;
      try {
        result = await client
          .from('establishments')
          .insert({ organization_id: organizationId, ...values })
          .select('id')
          .single();
      } catch {
        throw new EstablishmentUncertain(uncertain);
      }
      const { data, error } = result;
      if (error && answeredByServer(error.code)) {
        if (error.code === '22023')
          throw new EstablishmentRejected('Fuso horário inválido.');
        throw new EstablishmentRejected(
          'Criação recusada. Atualize o acesso e confira sua permissão.',
        );
      }
      if (error || typeof data?.id !== 'string')
        throw new EstablishmentUncertain(uncertain);
      return data.id;
    },
    async rename(organizationId, establishmentId, name) {
      const value = parseEstablishmentName(name);
      const unconfirmed = new EstablishmentRejected(
        'Não foi possível confirmar a alteração. Atualize o acesso e confira o nome da unidade.',
      );
      let result;
      try {
        result = await client
          .from('establishments')
          .update({ name: value })
          .eq('id', establishmentId)
          .eq('organization_id', organizationId)
          .select('id');
      } catch {
        throw unconfirmed;
      }
      const { data, error } = result;
      // Renaming is idempotent, so an unconfirmed attempt can simply be repeated.
      if (error && !answeredByServer(error.code)) throw unconfirmed;
      if (error || data?.length !== 1)
        throw new EstablishmentRejected(
          'Alteração recusada. Atualize o acesso e confira sua permissão.',
        );
    },
  };
}
