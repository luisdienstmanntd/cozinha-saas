import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import { instantToZoned, zonedToInstant } from '../../handling/domain/handling';
import type { ProductionGateway } from '../application/productionGateway';
import { ProductionRejected } from '../application/productionGateway';
import {
  TEMPERATURE_MOMENTS,
  temperatureInputSchema,
} from '../domain/production';
import type { TemperatureMoment } from '../domain/production';

export const TEMPERATURE_TEXT =
  'Registro opcional do que foi medido. O sistema não avalia se a temperatura está adequada, não cria ocorrência e não bloqueia o lote.';

// Fatia 7.9: temperatura medida no fim do resfriamento ou no reaquecimento. O banco decide quem pode
// registrar; a tela só repete a recusa dele.
export function RecordTemperature({
  scope,
  batchId,
  label,
  timezone,
  gateway,
  now,
  onRecorded,
}: {
  scope: CatalogScope;
  batchId: string;
  label: string;
  timezone: string;
  gateway: ProductionGateway;
  now: () => Date;
  onRecorded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [moment, setMoment] = useState<TemperatureMoment>('cooling_end');
  const [value, setValue] = useState('');
  const [measuredAt, setMeasuredAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !gateway.recordTemperature) return;
    const instant = zonedToInstant(measuredAt, timezone);
    const input = temperatureInputSchema.safeParse({
      batchId,
      moment,
      temperature: value.trim().replace(',', '.'),
      measuredAt: instant,
    });
    if (!input.success) {
      setError(
        'Informe a temperatura de -50 a 80 °C, com no máximo uma casa decimal, e o horário da medição.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await gateway.recordTemperature(scope, input.data);
      setOpen(false);
      setValue('');
      onRecorded();
    } catch (cause) {
      setError(
        cause instanceof ProductionRejected
          ? cause.message
          : 'Não foi possível confirmar o registro. Confira a lista antes de tentar de novo.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!gateway.recordTemperature) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setMeasuredAt(instantToZoned(now(), timezone));
          setOpen(true);
        }}
      >
        Registrar temperatura {label}
      </button>
    );
  return (
    <form
      aria-label={`Registrar temperatura ${label}`}
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={busy}>
        <legend>Temperatura da produção {label}</legend>
        <p>{TEMPERATURE_TEXT}</p>
        <label>
          Momento da medição{' '}
          <select
            value={moment}
            onChange={(event) =>
              setMoment(event.target.value as TemperatureMoment)
            }
          >
            {(Object.keys(TEMPERATURE_MOMENTS) as TemperatureMoment[]).map(
              (key) => (
                <option key={key} value={key}>
                  {TEMPERATURE_MOMENTS[key]}
                </option>
              ),
            )}
          </select>
        </label>{' '}
        <label>
          Temperatura medida (°C){' '}
          <input
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>{' '}
        <label>
          Horário da medição{' '}
          <input
            type="datetime-local"
            value={measuredAt}
            onChange={(event) => setMeasuredAt(event.target.value)}
          />
        </label>{' '}
        <button type="submit">Registrar temperatura medida</button>{' '}
        <button type="button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  );
}
