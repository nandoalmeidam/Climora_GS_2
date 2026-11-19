import { useState } from 'react'
import model from './territorialModel.json'

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
const format = (number: number | null) => number === null ? '—' : percent.format(number)

export function TerritorialAnalysis() {
  const [rain, setRain] = useState(55)
  const [coverage, setCoverage] = useState(75)
  const [missing, setMissing] = useState(false)
  const { bands, dataset, evaluation, minCoverage, territories, threshold } = model
  const band = bands[rain < 20 ? 0 : rain < 45 ? 1 : 2]
  const reason = missing ? 'Chuva prevista indisponível.'
    : coverage / 100 < minCoverage ? 'Cobertura de registros abaixo do mínimo.'
    : band.rows < 30 ? 'Poucos exemplos nessa faixa de chuva.' : ''
  const alert = !reason && band.probability >= threshold

  function chooseScenario(value: number) {
    setRain(value)
    setCoverage(75)
    setMissing(false)
  }

  return <section className="territorial-analysis" aria-labelledby="territorial-title">
    <div className="panel page-panel">
      <h2 id="territorial-title">Antecipação de relatos de alagamento</h2>
      <p>Escolha um exemplo para ver como a previsão de chuva pode ajudar a antecipar relatos de alagamento. Os exemplos usam bairros fictícios.</p>
      <div className="territorial-examples" role="group" aria-label="Exemplos de chuva">
        <button className="secondary" type="button" aria-pressed={!missing && coverage === 75 && rain === 10} onClick={() => chooseScenario(10)}>Pouca chuva</button>
        <button className="secondary" type="button" aria-pressed={!missing && coverage === 75 && rain === 55} onClick={() => chooseScenario(55)}>Chuva forte</button>
      </div>
      <details className="territorial-adjustments">
        <summary>Ajustar a simulação</summary>
        <div className="territorial-inputs">
        <label>Chuva prevista em 24 h <strong>{rain} mm</strong>
          <input type="range" min="0" max="100" value={rain} disabled={missing} onChange={event => setRain(Number(event.target.value))} />
        </label>
        <label>Quanto dos casos vira relato <strong>{coverage}%</strong>
          <input type="range" min="0" max="100" value={coverage} onChange={event => setCoverage(Number(event.target.value))} />
        </label>
        <div>
          <label className="territorial-checkbox">
            <input type="checkbox" checked={missing} aria-describedby="territorial-rain-help" onChange={event => setMissing(event.target.checked)} />
            Simular falta de dados de chuva
          </label>
          <p id="territorial-rain-help" className="territorial-checkbox-help">Marque para testar o que acontece quando falta a previsão de chuva. A simulação suspende a estimativa de alagamento até você desmarcar.</p>
        </div>
      </div>
      </details>
      <div className="territorial-result" role="status">
        <strong>{reason ? 'Estimativa suspensa' : alert ? 'Atenção no cenário simulado' : 'Sem sinal de atenção neste exemplo'}</strong>
        <p>{reason || `Chance de alguém relatar um alagamento nas próximas 24 horas: ${format(band.probability)}. A simulação sinaliza atenção a partir de ${format(threshold)}.`}</p>
        {!reason && <p>Na faixa de {band.label} mm, o treino registrou {band.reports} relatos em {band.rows} observações.</p>}
        {alert && <p>Em um piloto, esse resultado indicaria um caso para revisão humana e conferência das fontes oficiais.</p>}
      </div>
    </div>
    <div className="panel page-panel">
      <h2>Padrão encontrado</h2>
      <p>Frequência estimada de relatos por faixa de chuva no período de treino.</p>
      <ul className="territorial-bands">
        {bands.map(item => <li key={item.label}>
          <span>{item.label} mm</span>
          <meter aria-label={`Chance estimada na faixa de ${item.label} mm`} min="0" max="1" value={item.probability} />
          <strong>{format(item.probability)}</strong>
        </li>)}
      </ul>
      <h2>Origem e tratamento dos dados</h2>
      <p>O monitoramento da cidade usa dados públicos do Open-Meteo. A simulação usa uma base sintética separada, de {dataset.rawRows.toLocaleString('pt-BR')} observações, tratada em SQLite. A limpeza removeu {dataset.rawRows - dataset.cleanRows} linhas sem chuva válida.</p>
    </div>
    <div className="panel page-panel territorial-wide">
      <h2>Avaliação e indicadores de benefício</h2>
      <p>Treino com {dataset.training.toLocaleString('pt-BR')} observações e teste posterior com {dataset.testing} observações. Métricas calculadas em dados sintéticos.</p>
      <div className="table-scroll"><table className="risk-table">
        <caption>Desempenho por setor simulado</caption>
        <thead><tr><th scope="col">Setor</th><th scope="col">Cobertura da análise</th><th scope="col">Precisão dos alertas</th><th scope="col">Relatos sinalizados</th><th scope="col">Alarmes sem relato</th></tr></thead>
        <tbody>{[{ name: 'Total', ...evaluation }, ...territories].map(row => <tr key={row.name}>
          <th scope="row">{row.name}</th><td>{format(row.reach)}</td><td>{format(row.precision)}</td><td>{row.trueAlerts} de {row.reported} ({format(row.captured)})</td><td>{row.falseAlerts}</td>
        </tr>)}</tbody>
      </table></div>
      <p>Entre os casos avaliados, a sensibilidade foi de {format(evaluation.recall)}. O erro de Brier foi {decimal.format(evaluation.brier ?? 0)}, ante {decimal.format(evaluation.baselineBrier ?? 0)} de uma estimativa constante. Valores menores indicam menor erro probabilístico.</p>
      <p>Relatos sinalizados e alarmes sem relato ajudam a estimar alcance e carga de revisão. Para medir benefício social em um piloto, acompanhe também o tempo de resposta e a proporção de áreas com baixa cobertura que recebem atenção.</p>
    </div>
    <div className="panel page-panel territorial-wide">
      <h2>Limites, privacidade e inclusão</h2>
      <p>A cobertura mínima de {format(minCoverage)} reduz as estimativas em áreas com poucos registros, mas também pode deixar setores inteiros sem análise. Ausência de relato pode refletir subnotificação. Drenagem e relevo ficaram fora do modelo.</p>
      <p>A análise usa dados agregados e sintéticos, sem nomes, endereços, fotos ou contas. Em um piloto, combine canais presenciais e digitais, compare a cobertura por área e faça revisão humana antes de qualquer decisão. Para a cidade selecionada, consulte o monitoramento e os avisos oficiais acima.</p>
    </div>
  </section>
}

