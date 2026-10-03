import React, { useState } from 'react';
import { Funcionario, FuncionarioStatus } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import { validarCPF } from '../../utils/calculations';
import { UserCheck, Plus, Search, ShieldAlert, Edit2, Ban, CheckCircle2 } from 'lucide-react';

const repo = new PostoSubcollectionRepository<Funcionario>('funcionarios');

interface FuncionariosViewProps {
  funcionarios: Funcionario[];
  onReload: () => void;
}

export const FuncionariosView: React.FC<FuncionariosViewProps> = ({ funcionarios, onReload }) => {
  const { postoId, userProfile } = useAuth();
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<string>('TODOS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFuncionario, setEditingFuncionario] = useState<Funcionario | null>(null);

  // Form states
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [matricula, setMatricula] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cargo, setCargo] = useState('Frentista');
  const [funcao, setFuncao] = useState('Abastecimento de Pista');
  const [status, setStatus] = useState<FuncionarioStatus>('ATIVO');
  const [turnoPreferencial, setTurnoPreferencial] = useState('Turno 1 - Manhã (06h - 14h)');
  const [observacoes, setObservacoes] = useState('');
  const [erroMsg, setErroMsg] = useState('');

  const podeGerenciar = userProfile?.role === 'MASTER' || userProfile?.role === 'GERENTE' || userProfile?.role === 'SUPERVISOR';

  const normalizarTurnoFuncionario = (t?: string) => {
    const val = (t || '').toLowerCase();
    if (val.includes('horista') || val === 'hor') return 'Turno Horista';
    if (val.includes('tarde') || val.includes('14h') || val.includes('turno 2 - tarde') || val === 'turno 2') {
      return 'Turno 2 - Tarde (14h - 22h)';
    }
    return 'Turno 1 - Manhã (06h - 14h)';
  };

  const abrirNovo = () => {
    setEditingFuncionario(null);
    setNome('');
    setCpf('');
    setMatricula(`MAT-${Math.floor(1000 + Math.random() * 9000)}`);
    setTelefone('');
    setCargo('Frentista');
    setFuncao('Abastecimento');
    setStatus('ATIVO');
    setTurnoPreferencial('Turno 1 - Manhã (06h - 14h)');
    setObservacoes('');
    setErroMsg('');
    setIsModalOpen(true);
  };

  const abrirEdicao = (f: Funcionario) => {
    setEditingFuncionario(f);
    setNome(f.nome);
    setCpf(f.cpf);
    setMatricula(f.matricula);
    setTelefone(f.telefone);
    setCargo(f.cargo);
    setFuncao(f.funcao);
    setStatus(f.status);
    setTurnoPreferencial(normalizarTurnoFuncionario(f.turnoPreferencial));
    setObservacoes(f.observacoes || '');
    setErroMsg('');
    setIsModalOpen(true);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg('');

    if (!nome.trim()) {
      setErroMsg('O nome é obrigatório.');
      return;
    }

    if (cpf.trim() && !validarCPF(cpf)) {
      setErroMsg('CPF inválido. Verifique os números digitados.');
      return;
    }

    const agora = new Date().toISOString();
    const id = editingFuncionario ? editingFuncionario.id : `func-${Date.now()}`;

    const novoFuncionario: Funcionario = {
      id,
      postoId,
      nome,
      cpf: cpf || '000.000.000-00',
      matricula,
      telefone,
      cargo,
      funcao,
      status,
      dataAdmissao: editingFuncionario ? editingFuncionario.dataAdmissao : agora.slice(0, 10),
      turnoPreferencial,
      observacoes,
      criadoEm: editingFuncionario ? editingFuncionario.criadoEm : agora,
      atualizadoEm: agora,
    };

    try {
      await repo.save(postoId, novoFuncionario);
      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'FUNCIONARIOS',
        'Funcionario',
        id,
        editingFuncionario ? 'UPDATE' : 'CREATE',
        editingFuncionario ? (editingFuncionario as unknown as Record<string, unknown>) : null,
        novoFuncionario as unknown as Record<string, unknown>
      );
      setIsModalOpen(false);
      onReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar funcionário no Firestore';
      setErroMsg(msg);
    }
  };

  const alternarStatusSoftDelete = async (f: Funcionario) => {
    if (!podeGerenciar) return;
    const novoStatus: FuncionarioStatus = f.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    const atualizado = { ...f, status: novoStatus, atualizadoEm: new Date().toISOString() };
    await repo.save(postoId, atualizado);
    await registrarAuditoria(
      postoId,
      userProfile?.uid || 'anon',
      userProfile?.nome || 'Operador',
      'FUNCIONARIOS',
      'Funcionario',
      f.id,
      novoStatus === 'ATIVO' ? 'ACTIVATE' : 'DEACTIVATE',
      { status: f.status },
      { status: novoStatus }
    );
    onReload();
  };

  const filtrados = funcionarios.filter((f) => {
    const matchBusca = f.nome.toLowerCase().includes(busca.toLowerCase()) || f.matricula.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = statusFiltro === 'TODOS' || f.status === statusFiltro;
    return matchBusca && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header Operacional */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-blue-600" />
            Quadro de Funcionários
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Controle de frentistas, caixas e supervisores operacionais com soft delete.
          </p>
        </div>

        {podeGerenciar && (
          <button
            onClick={abrirNovo}
            id="btn-novo-funcionario"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Novo Funcionário
          </button>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative sm:col-span-2">
          <Search className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou matrícula..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value)}
          className="bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="TODOS">Todos os Status</option>
          <option value="ATIVO">Ativos</option>
          <option value="INATIVO">Inativos (Desativados)</option>
          <option value="FERIAS">Férias</option>
          <option value="AFASTADO">Afastados</option>
        </select>
      </div>

      {/* Tabela de Funcionários */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Visão Mobile Adaptada em Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtrados.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Nenhum funcionário encontrado.
            </div>
          ) : (
            filtrados.map((f) => (
              <div key={`mob-${f.id}`} className="p-4 space-y-2.5 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {f.nome.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">{f.nome}</div>
                      <div className="text-xs text-slate-400">CPF: {f.cpf} • {f.matricula}</div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      f.status === 'ATIVO'
                        ? 'bg-emerald-100 text-emerald-800'
                        : f.status === 'FERIAS'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {f.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                  <div>
                    <span className="font-semibold text-slate-800">{f.cargo}</span>
                    <span className="text-slate-400 text-[11px] block">{f.funcao}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      normalizarTurnoFuncionario(f.turnoPreferencial).includes('Horista')
                        ? 'bg-teal-50 text-teal-800 border-teal-200'
                        : normalizarTurnoFuncionario(f.turnoPreferencial).includes('Turno 2')
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {normalizarTurnoFuncionario(f.turnoPreferencial).split('(')[0].trim()}
                  </span>
                </div>

                {podeGerenciar && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(f)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarStatusSoftDelete(f)}
                      className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        f.status === 'ATIVO'
                          ? 'bg-red-50 text-red-700 hover:bg-red-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {f.status === 'ATIVO' ? (
                        <>
                          <Ban className="w-3.5 h-3.5" />
                          Desativar
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Reativar
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Tabela para Desktop e Tablet */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-3.5">Funcionário</th>
                <th className="px-6 py-3.5">Matrícula</th>
                <th className="px-6 py-3.5">Cargo / Função</th>
                <th className="px-6 py-3.5">Turno Preferencial</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                    Nenhum funcionário encontrado.
                  </td>
                </tr>
              ) : (
                filtrados.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{f.nome}</div>
                      <div className="text-xs text-slate-400">CPF: {f.cpf}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-700">{f.matricula}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-800">{f.cargo}</span>
                      <div className="text-xs text-slate-400">{f.funcao}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
                          normalizarTurnoFuncionario(f.turnoPreferencial).includes('Horista')
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : normalizarTurnoFuncionario(f.turnoPreferencial).includes('Turno 2')
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {normalizarTurnoFuncionario(f.turnoPreferencial)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          f.status === 'ATIVO'
                            ? 'bg-emerald-100 text-emerald-800'
                            : f.status === 'FERIAS'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {f.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {podeGerenciar && (
                        <>
                          <button
                            onClick={() => abrirEdicao(f)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => alternarStatusSoftDelete(f)}
                            className={`p-1.5 rounded transition ${
                              f.status === 'ATIVO'
                                ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={f.status === 'ATIVO' ? 'Desativar (Soft delete)' : 'Reativar'}
                          >
                            {f.status === 'ATIVO' ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro/Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingFuncionario ? 'Editar Funcionário' : 'Novo Funcionário'}
            </h3>

            {erroMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <span>{erroMsg}</span>
              </div>
            )}

            <form onSubmit={handleSalvar} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Ex: Carlos Oliveira"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">CPF</label>
                  <input
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Matrícula</label>
                  <input
                    type="text"
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Cargo</label>
                  <select
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Frentista">Frentista</option>
                    <option value="Operador de Caixa">Operador de Caixa</option>
                    <option value="Lubrificador">Lubrificador</option>
                    <option value="Supervisor de Pista">Supervisor de Pista</option>
                    <option value="Gerente">Gerente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as FuncionarioStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="ATIVO">Ativo</option>
                    <option value="INATIVO">Inativo</option>
                    <option value="FERIAS">Férias</option>
                    <option value="AFASTADO">Afastado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Turno Preferencial</label>
                <select
                  value={turnoPreferencial}
                  onChange={(e) => setTurnoPreferencial(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Turno 1 - Manhã (06h - 14h)">Turno 1 — Manhã (06h às 14h)</option>
                  <option value="Turno 2 - Tarde (14h - 22h)">Turno 2 — Tarde (14h às 22h)</option>
                  <option value="Turno Horista">Turno Horista (Flexível / Por Hora)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
