import type { NewEstablishment } from '../domain/establishment';

/** The server answered and refused: nothing was written. */
export class EstablishmentRejected extends Error {}
/** No reliable answer: the write may or may not have happened. */
export class EstablishmentUncertain extends Error {}

export interface EstablishmentGateway {
  create(organizationId: string, input: NewEstablishment): Promise<string>;
  rename(
    organizationId: string,
    establishmentId: string,
    name: string,
  ): Promise<void>;
}
