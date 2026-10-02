import React, { useState } from 'react';
import {
  Funcionario,
  Escala,
  FechamentoCaixa,
  OcorrenciaCaixa,
  Tanque,
  Bico,
  Afericao,
  RegistroDensidade,
  Conformidade,
  AuditLog,
} from '../../types';
import { FileText, Printer, Download, Filter, Search, Trash2 } from 'lucide-react';
import { formatarMoeda } from '../../utils/calculations';

interface RelatoriosProps {
  funcionarios: Funcionario[];
  escalas: Escala[];
  fechamentos: FechamentoCaixa[];
  ocorrencias: OcorrenciaCaixa[];
  tanques: Tanque[];
  bicos: Bico[];
  afericoes: Afericao[];
  densidades: RegistroDensidade[];
  conformidades: Conformidade[];
  auditoria: AuditLog[];
  onLimparDemonstracao?: () => void;
}

type TipoRelatorio =
  | 'FECHAMENTOS'
  | 'FALTAS'
  | 'AFERICOES'
  | 'DENSIDADES'
  | 'CONFORMIDADE'
  | 'FUNCIONARIOS'
  | 'ESCALAS'
  | 'TANQUES'
  | 'AUDITORIA';

export const RelatoriosView: React.FC<RelatoriosProps> = ({
  funcionarios,
  escalas,
  fechamentos,
  ocorrencias,
  tanques,
  bicos,
  afericoes,
  densidades,
  conformidades,
  auditoria,
  onLimparDemonstracao,
}) => {
  const [tipo, setTipo] = useState<TipoRelatorio>('ESCALAS');
  const [subModoEscala, setSubModoEscala] = useState<'DIARIO' | 'SEMANAL' | 'MENSAL' | 'FUNCIONARIO' | 'SETOR'>('MENSAL');
  const [filtroFuncRelatorio, setFiltroFuncRelatorio] = useState<string>('TODOS');
  const [filtroSetorRelatorio, setFiltroSetorRelatorio] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 7) + '-31');

  const handleImprimir = () => {
    window.print();
  };

  const handleExportarCsv = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    let linhas: string[][] = [];

    if (tipo === 'FECHAMENTOS') {
      linhas.push([
        'ID',
        'Data',
        'Turno',
        'Operador',
        'Total_Bombas_Conferido',
        'Total_Recolhido_Informado',
        'Diferenca',
        'Status',
        'Pix',
        'Cartao',
        'Nota',
        'Deposito',
        'Pix_CNPJ',
        'Despesa',
        'Outros',
      ]);
      fechamentos.forEach((f) => {
        linhas.push([
          f.id,
          f.data,
          f.turno,
          f.funcionarioNome || '',
          String(f.totalConferido),
          String(f.totalInformado),
          String(f.diferenca),
          f.tipoDiferenca,
          String(f.recolhimento?.pix ?? ''),
          String(f.recolhimento?.cartao ?? ''),
          String(f.recolhimento?.nota ?? ''),
          String(f.recolhimento?.deposito ?? ''),
          String(f.recolhimento?.pixCnpj ?? ''),
          String(f.recolhimento?.despesa ?? ''),
          String(f.recolhimento?.outros ?? ''),
        ]);
      });
    } else if (tipo === 'ESCALAS') {
      linhas.push([
        'Funcionario',
        'Data',
        'Dia_Semana',
        'Entrada',
        'Saida',
        'Intervalo',
        'Turno',
        'Setor',
        'Funcao',
        'Status',
        'Observacoes',
      ]);
      escalas.forEach((e) => {
        linhas.push([
          e.funcionarioNome,
          e.data,
          e.diaSemana || '',
          e.horarioInicio,
          e.horarioFim,
          e.intervalo || '1h',
          e.turno,
          e.setor || 'Pista',
          e.funcao || 'Frentista',
          e.status,
          e.observacao || '',
        ]);
      });
    } else if (tipo === 'AFERICOES') {
      linhas.push([
        'Data',
        'Hora',
        'Bico',
        'Produto',
        'Nominal',
        'Aferido',
        'Diferenca_ml',
        'Resultado',
        'Encerrante_Foto',
        'Lacre_Inmetro',
        'Responsavel',
      ]);
      afericoes.forEach((a) => {
        linhas.push([
          a.data,
          a.hora,
          String(a.bicoNumero || a.bicoId),
          a.produto,
          String(a.volumeNominal),
          String(a.volumeAferido),
          String(Math.round(a.diferenca * 1000)),
          a.resultado,
          String(a.encerranteFinal ?? a.encerranteLeitura ?? ''),
          a.lacreInmetro || '',
          a.responsavelNome || '',
        ]);
      });
    } else if (tipo === 'AUDITORIA') {
      linhas.push(['Timestamp', 'Usuario', 'Modulo', 'Entidade', 'Acao']);
      auditoria.forEach((l) => {
        linhas.push([l.timestamp, l.usuarioNome, l.modulo, l.entidade, l.acao]);
      });
    } else {
      linhas.push(['ID', 'Posto', 'Data']);
    }

    const csvStr = linhas.map((e) => e.join(';')).join('\n');
    csvContent += encodeURI(csvStr);
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `relatorio_${tipo.toLowerCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-slate-700" />
            Central de Relatórios Operacionais
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Geração de relatórios com filtros por período, busca, impressão e exportação estruturada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onLimparDemonstracao && (
            <button
              onClick={onLimparDemonstracao}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg text-sm transition border border-red-200"
              title="Remover todos os dados de demonstração e resetar posto"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              Limpar Demonstração
            </button>
          )}
          <button
            onClick={handleExportarCsv}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm transition"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={handleImprimir}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Seleção do Tipo */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Módulo / Assunto</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoRelatorio)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="ESCALAS">Escalas & Planner (Diário, Semanal, Mensal, Funcionário, Setor)</option>
            <option value="AFERICOES">Aferições de Bicos (Com Informações da Foto)</option>
            <option value="TANQUES">Cadastro de Bicos & Tanques</option>
            <option value="FECHAMENTOS">Fechamentos de Caixa</option>
            <option value="FALTAS">Faltas e Ocorrências</option>
            <option value="DENSIDADES">Análises de Densidade</option>
            <option value="CONFORMIDADE">Conformidade e Checklists</option>
            <option value="FUNCIONARIOS">Quadro de Funcionários</option>
            <option value="AUDITORIA">Trilha de Auditoria (Logs)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Data Início</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Data Fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Busca Rápida</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar registros..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Relatório Renderizado (Preparado para Impressão) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:shadow-none print:border-none">
        <div className="mb-6 pb-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 uppercase">
              MEU POSTO 2.0 — Relatório Operacional: {tipo}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Período: {dataInicio} até {dataFim} • Emitido em: {new Date().toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="text-right text-xs text-slate-400">Ambiente de Produção</div>
        </div>

        {/* Relatório Completo de Escalas e Planner (Requisito 18) */}
        {tipo === 'ESCALAS' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 print:hidden">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'DIARIO', label: 'Relatório Diário' },
                    { id: 'SEMANAL', label: 'Relatório Semanal' },
                    { id: 'MENSAL', label: 'Relatório Mensal' },
                    { id: 'FUNCIONARIO', label: 'Por Funcionário' },
                    { id: 'SETOR', label: 'Por Setor' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSubModoEscala(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      subModoEscala === m.id
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={filtroFuncRelatorio}
                  onChange={(e) => setFiltroFuncRelatorio(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                >
                  <option value="TODOS">Todos os Funcionários</option>
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>

                <select
                  value={filtroSetorRelatorio}
                  onChange={(e) => setFiltroSetorRelatorio(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                >
                  <option value="TODOS">Todos os Setores</option>
                  <option value="Pista">Pista</option>
                  <option value="Caixa">Caixa</option>
                  <option value="Conveniência">Conveniência</option>
                  <option value="Lubrificação">Lubrificação</option>
                  <option value="Gerência">Gerência</option>
                </select>
              </div>
            </div>

            <div className="text-xs font-bold text-slate-600 uppercase">
              Modalidade Selecionada: {subModoEscala}
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Funcionário</th>
                  <th className="py-2.5 px-3">Data / Dia</th>
                  <th className="py-2.5 px-3">Entrada</th>
                  <th className="py-2.5 px-3">Saída</th>
                  <th className="py-2.5 px-3">Intervalo</th>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3">Setor / Função</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {escalas
                  .filter((e) => {
                    if (dataInicio && e.data < dataInicio) return false;
                    if (dataFim && e.data > dataFim) return false;
                    if (subModoEscala === 'DIARIO' && dataInicio && e.data !== dataInicio) return false;
                    if (filtroFuncRelatorio !== 'TODOS' && e.funcionarioId !== filtroFuncRelatorio) return false;
                    if (filtroSetorRelatorio !== 'TODOS' && (e.setor || 'Pista') !== filtroSetorRelatorio) return false;
                    if (busca.trim()) {
                      const q = busca.toLowerCase();
                      if (
                        !e.funcionarioNome.toLowerCase().includes(q) &&
                        !(e.setor || '').toLowerCase().includes(q) &&
                        !e.turno.toLowerCase().includes(q)
                      ) {
                        return false;
                      }
                    }
                    return true;
                  })
                  .sort((a, b) => a.data.localeCompare(b.data) || a.funcionarioNome.localeCompare(b.funcionarioNome))
                  .map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-slate-900">{e.funcionarioNome}</td>
                      <td className="py-2 px-3 font-mono">
                        {e.data} {e.diaSemana ? `(${e.diaSemana})` : ''}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold">{e.horarioInicio}</td>
                      <td className="py-2 px-3 font-mono font-semibold">{e.horarioFim}</td>
                      <td className="py-2 px-3">{e.intervalo || '1h'}</td>
                      <td className="py-2 px-3">{e.turno}</td>
                      <td className="py-2 px-3">
                        {e.setor || 'Pista'} • {e.funcao || 'Frentista'}
                      </td>
                      <td className="py-2 px-3 font-bold">{e.status}</td>
                      <td className="py-2 px-3 text-slate-500">{e.observacao || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Relatório de Cadastro de Bicos e Tanques */}
        {tipo === 'TANQUES' && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase text-slate-700">Tanques Cadastrados ({tanques.length})</h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
                <tr>
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Combustível</th>
                  <th className="py-2 px-3">Capacidade</th>
                  <th className="py-2 px-3">Estoque Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tanques.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 px-3 font-bold">{t.codigo}</td>
                    <td className="py-2 px-3">{t.produto}</td>
                    <td className="py-2 px-3 font-mono">{t.capacidadeNominal.toLocaleString('pt-BR')} L</td>
                    <td className="py-2 px-3 font-mono font-bold">{t.volumeAtual.toLocaleString('pt-BR')} L</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 className="text-xs font-bold uppercase text-slate-700 pt-2">Bicos Cadastrados ({bicos.length})</h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
                <tr>
                  <th className="py-2 px-3">Bico / Bomba</th>
                  <th className="py-2 px-3">Combustível</th>
                  <th className="py-2 px-3">Tanque Vinculado</th>
                  <th className="py-2 px-3">Encerrante Atual</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bicos.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 px-3 font-bold">
                      Bico {String(b.numero).padStart(2, '0')} ({b.bomba} • Lado {b.lado})
                    </td>
                    <td className="py-2 px-3">{b.produto}</td>
                    <td className="py-2 px-3 font-mono">{b.tanqueCodigo || b.tanqueId}</td>
                    <td className="py-2 px-3 font-mono">{(b.encerranteAtual || 0).toLocaleString('pt-BR')} L</td>
                    <td className="py-2 px-3 font-bold">{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabela de Fechamentos */}
        {tipo === 'FECHAMENTOS' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data / Turno</th>
                <th className="py-2.5 px-3">Operador / Caixa</th>
                <th className="py-2.5 px-3">Informado</th>
                <th className="py-2.5 px-3">Conferido</th>
                <th className="py-2.5 px-3">Diferença</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fechamentos.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 px-3">
                    {f.data} ({f.turno})
                  </td>
                  <td className="py-2 px-3">{f.funcionarioNome}</td>
                  <td className="py-2 px-3 font-mono">{formatarMoeda(f.totalInformado)}</td>
                  <td className="py-2 px-3 font-mono font-bold">{formatarMoeda(f.totalConferido)}</td>
                  <td className="py-2 px-3 font-mono font-bold">
                    <span className={f.diferenca < 0 ? 'text-red-600' : 'text-emerald-600'}>
                      {formatarMoeda(f.diferenca)}
                    </span>
                  </td>
                  <td className="py-2 px-3">{f.tipoDiferenca}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Aferições */}
        {tipo === 'AFERICOES' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Bico / Produto</th>
                <th className="py-2.5 px-3">Nominal</th>
                <th className="py-2.5 px-3">Aferido</th>
                <th className="py-2.5 px-3">Diferença</th>
                <th className="py-2.5 px-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {afericoes.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-3">
                    {a.data} {a.hora}
                  </td>
                  <td className="py-2 px-3">{a.produto}</td>
                  <td className="py-2 px-3 font-mono">{a.volumeNominal.toFixed(3)} L</td>
                  <td className="py-2 px-3 font-mono font-bold">{a.volumeAferido.toFixed(3)} L</td>
                  <td className="py-2 px-3 font-mono">{Math.round(a.diferenca * 1000)} ml</td>
                  <td className="py-2 px-3 font-bold">{a.resultado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tabela de Auditoria */}
        {tipo === 'AUDITORIA' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b font-semibold text-slate-700 uppercase">
              <tr>
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Usuário</th>
                <th className="py-2.5 px-3">Módulo</th>
                <th className="py-2.5 px-3">Entidade</th>
                <th className="py-2.5 px-3">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditoria.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 px-3 font-mono text-[11px]">{new Date(l.timestamp).toLocaleString('pt-BR')}</td>
                  <td className="py-2 px-3 font-medium">{l.usuarioNome}</td>
                  <td className="py-2 px-3">{l.modulo}</td>
                  <td className="py-2 px-3">{l.entidade}</td>
                  <td className="py-2 px-3 font-bold text-blue-700">{l.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
