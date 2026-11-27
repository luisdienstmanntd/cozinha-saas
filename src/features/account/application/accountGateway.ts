import type { MfaEnrollment, MfaFactor } from '../domain/account';

export interface AccountGateway {
  /** Troca a senha da própria conta. */
  changePassword(password: string): Promise<void>;
  /** Fatores de segundo passo já confirmados. */
  factors(): Promise<MfaFactor[]>;
  /** Começa o cadastro do app autenticador (o fator só vale depois de confirmar o código). */
  startEnroll(): Promise<MfaEnrollment>;
  /** Confirma o código mostrado pelo app e ativa o fator. */
  confirmEnroll(factorId: string, code: string): Promise<void>;
  /** Descarta um cadastro iniciado e não confirmado. */
  cancelEnroll(factorId: string): Promise<void>;
  /** Remove um fator confirmado; exige o código atual do app. */
  removeFactor(factorId: string, code: string): Promise<void>;
}
