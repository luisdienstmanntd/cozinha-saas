import { useDemoAcknowledgement } from '../application/useDemoAcknowledgement';

const steps = [
  {
    title: 'Identificar',
    description: 'Ligar o recipiente ao produto e ao lote de origem.',
  },
  {
    title: 'Acompanhar',
    description: 'Consultar a validade informada pelo responsável.',
  },
  {
    title: 'Registrar',
    description: 'Manter o histórico de consumo e descarte.',
  },
];

export function DemoHome() {
  const { acknowledged, result, confirm, updateAcknowledgement } =
    useDemoAcknowledgement();

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <header className="site-header">
        <a className="wordmark" href="#conteudo">
          Gestão de cozinha
        </a>
        <span className="badge">Ambiente de demonstração</span>
      </header>
      <main id="conteudo" className="page">
        <section className="intro" aria-labelledby="titulo">
          <p className="eyebrow">Organização para a rotina da cozinha</p>
          <h1 id="titulo">Cada recipiente, uma história clara.</h1>
          <p className="lead">
            Uma base para identificar alimentos, acompanhar validades informadas
            e registrar o que acontece na operação.
          </p>
          <div className="notice">
            <strong>Primeiro, conheça o escopo.</strong>
            <p>
              Esta versão apresenta o fluxo previsto. Cadastros, etiquetas e
              movimentações ainda não estão disponíveis. Nenhum dado é salvo.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              confirm();
            }}
            noValidate
          >
            <label className="confirmation">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) =>
                  updateAcknowledgement(event.target.checked)
                }
                aria-describedby={
                  result && !result.accepted
                    ? 'confirmation-feedback'
                    : undefined
                }
                aria-invalid={result && !result.accepted ? true : undefined}
              />
              Entendo que esta demonstração não salva dados.
            </label>
            <button type="submit">Confirmar escopo da demonstração</button>
            {result && (
              <p
                id="confirmation-feedback"
                role={result.accepted ? 'status' : 'alert'}
                className={result.accepted ? 'feedback' : 'feedback error'}
              >
                {result.message}
              </p>
            )}
          </form>
        </section>
        <section className="flow" aria-labelledby="fluxo-titulo">
          <p className="eyebrow">Da identificação ao histórico</p>
          <h2 id="fluxo-titulo">O fluxo que vamos construir</h2>
          <ol className="steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="step-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="scope-note">
            A validade será informada e confirmada pelo responsável. O sistema
            não define prazos sanitários.
          </p>
        </section>
      </main>
      <footer>Fundação da aplicação · Fase 1</footer>
    </>
  );
}
