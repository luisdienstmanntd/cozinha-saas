import { z } from 'zod';

// Fatia 7.6 (decisões A e B de luis, 14/11/2026): configurações da unidade, escolhidas pelo proprietário.
// Os padrões são as regras de antes da 7.6; o sistema não sugere outros valores.
export const registrars = ['owner', 'member'] as const;
export const portionRules = ['equal', 'equal_or_less'] as const;
export type Registrar = (typeof registrars)[number];
export type PortionRule = (typeof portionRules)[number];

// luis, 14/11/2026 (aceite da 7.6, ponto 2): a regra "igual ou menor" fica implementada e testada no
// banco e na tela de porcionar, mas a opção de ativá-la fica OCULTA até a avaliação da nutricionista RT.
// O padrão é "igual à validade do lote" e nada ativa a regra sozinho. Só mudar com nova decisão de luis.
export const PORTION_RULE_SELECTABLE = false;

export const MIN_MINUTES = 15;
export const MAX_MINUTES = 1440;
const minutes = z.number().int().min(MIN_MINUTES).max(MAX_MINUTES);

export const settingsSchema = z.object({
  production_registrar: z.enum(registrars),
  production_window_minutes: minutes,
  unlabeled_limit_minutes: minutes,
  portion_expiry_rule: z.enum(portionRules),
});
export type EstablishmentSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: EstablishmentSettings = {
  production_registrar: 'owner',
  production_window_minutes: 120,
  unlabeled_limit_minutes: 60,
  portion_expiry_rule: 'equal',
};

export const registrarLabels: Record<Registrar, string> = {
  owner: 'Só o proprietário',
  member: 'Cada colaborador registra a própria produção',
};
export const portionRuleLabels: Record<PortionRule, string> = {
  equal: 'Igual à validade do lote',
  equal_or_less: 'Igual ou menor que a validade do lote (nunca maior)',
};

// "2 horas", "1 hora e 30 minutos", "45 minutos" (o mesmo texto das mensagens do banco).
export function durationText(total: number): string {
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts = [
    hours === 1 ? '1 hora' : hours > 1 ? `${hours} horas` : '',
    rest === 1 ? '1 minuto' : rest > 1 ? `${rest} minutos` : '',
  ].filter(Boolean);
  return parts.join(' e ');
}

// Mensagens de recusa do banco que a tela repete. Lista exata; um teste confere que cada uma existe nas
// migrações.
export const SETTINGS_MESSAGES = [
  'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.',
  'O tempo máximo sem etiqueta deve ficar entre 15 minutos e 24 horas, em minutos inteiros.',
  'Unidade não encontrada.',
] as const;

export function knownSettingsMessage(message: unknown): string | null {
  return typeof message === 'string' &&
    (SETTINGS_MESSAGES as readonly string[]).includes(message)
    ? message
    : null;
}
