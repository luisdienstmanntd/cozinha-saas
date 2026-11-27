import type { UnitMetrics } from '../domain/metrics';
import { shareText } from '../domain/metrics';

/** Barras decorativas; nomes, bases e valores são a informação acessível. */
export function MetricCharts({ metrics: m }: { metrics: UnitMetrics }) {
  const volumes = [
    { label: 'Manipulações', value: m.handlings_total },
    { label: 'Produções', value: m.productions_total },
    { label: 'Mudanças de local', value: m.location_moves_total },
  ];
  const maximum = Math.max(...volumes.map(({ value }) => value));
  const late = [
    { label: 'Manipulações', part: m.handlings_late, total: m.handlings_total },
    {
      label: 'Produções',
      part: m.productions_late,
      total: m.productions_total,
    },
  ];
  return (
    <div className="metrics-chart-grid">
      <section
        className="mesa-panel metrics-chart"
        aria-label="Volume de registros"
      >
        <h3>Volume de registros</h3>
        <p>Atividades registradas no período, comparadas na mesma escala.</p>
        <dl className="metrics-chart-rows">
          {volumes.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
              {maximum > 0 && (
                <dd className="metrics-chart-mark" aria-hidden="true">
                  <progress
                    className="metrics-bar"
                    value={value}
                    max={maximum}
                  />
                </dd>
              )}
            </div>
          ))}
        </dl>
        {maximum > 0 ? (
          <div className="metrics-chart-axis" aria-hidden="true">
            <span>0</span>
            <span>{maximum} registros</span>
          </div>
        ) : (
          <p>
            Nenhuma manipulação, produção ou mudança de local registrada neste
            período.
          </p>
        )}
        <p className="metrics-chart-note">
          As atividades são independentes; as barras não formam um total.
        </p>
      </section>
      <section
        className="mesa-panel metrics-chart metrics-chart-late"
        aria-label="Proporção de registros com atraso"
      >
        <h3>Registros com atraso</h3>
        <p>
          Participação dentro de cada atividade. A base aparece ao lado do
          percentual.
        </p>
        <dl className="metrics-chart-rows">
          {late.map(({ label, part, total }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {total > 0 ? (
                  <>
                    <strong>{shareText(part, total)}</strong>
                    <span className="metrics-chart-base">
                      {part} de {total} registros
                    </span>
                  </>
                ) : (
                  'Sem registros no período'
                )}
              </dd>
              {total > 0 && (
                <dd className="metrics-chart-mark" aria-hidden="true">
                  <progress
                    className="metrics-bar"
                    max={100}
                    value={(part / total) * 100}
                  />
                </dd>
              )}
            </div>
          ))}
        </dl>
        {late.some(({ total }) => total > 0) && (
          <div className="metrics-chart-axis" aria-hidden="true">
            <span>0%</span>
            <span>100%</span>
          </div>
        )}
        <p className="metrics-chart-note">
          O atraso considera a janela de registro aplicável a cada operação.
        </p>
      </section>
    </div>
  );
}
