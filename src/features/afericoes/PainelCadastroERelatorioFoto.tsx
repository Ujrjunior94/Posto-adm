import React, { useState, useRef } from 'react';
import { Bico, Tanque, Afericao, Funcionario, PontoCalibracao } from '../../types';
import { PostoSubcollectionRepository, registrarAuditoria } from '../../repositories/firestoreRepository';
import { useAuth } from '../../contexts/AuthContext';
import { calcularAfericao, TOLERANCIA_DESVIO_PADRAO_L } from '../../utils/calculations';
import { PRECOS_PADRAO_COMBUSTIVEL, formatarPrecoLitro } from '../../utils/pricing';
import {
  Camera,
  Upload,
  Save,
  Printer,
  Download,
  CheckCircle2,
  XCircle,
  Fuel,
  Database,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Eye,
  RefreshCw,
  Check,
  AlertTriangle,
  Gauge,
} from 'lucide-react';

const repoTanques = new PostoSubcollectionRepository<Tanque>('tanques');
const repoBicos = new PostoSubcollectionRepository<Bico>('bicos');
const repoAfericoes = new PostoSubcollectionRepository<Afericao>('afericoes');

interface PainelCadastroERelatorioFotoProps {
  bicos: Bico[];
  tanques: Tanque[];
  afericoes: Afericao[];
  funcionarios: Funcionario[];
  modoInicial?: 'CADASTRO' | 'RELATORIO_FOTO';
  onReload: () => void;
}

interface ItemAfericaoExtraidaFoto {
  numeroBico: number;
  bomba: string;
  lado: 'A' | 'B';
  produto: string;
  tanqueCodigo: string;
  precoLitro: number;
  volumeNominal: number;
  volumeAferido: number;
  desvioMl: number;
  encerranteInicial?: number;
  encerranteFinal?: number;
  lacreInmetro?: string;
  temperaturaC?: number;
  resultado: 'CONFORME' | 'NAO_CONFORME';
  detalhesFotoBico?: string;
}

interface ResultadoOCRAfericao {
  tituloDocumento: string;
  dataIdentificada: string;
  horaIdentificada: string;
  responsavelIdentificado?: string;
  equipamentoIdentificado?: string;
  certificadoInmetro?: string;
  resumoGeralFoto: string;
  tanquesExtraidos?: Array<{
    codigo: string;
    produto: string;
    capacidadeNominal?: number;
    capacidadeOperacional?: number;
    observacoes?: string;
  }>;
  bicosEAfericoes: ItemAfericaoExtraidaFoto[];
}

// Reduz e comprime imagem para caber perfeitamente no documento Firestore e exibir no relatório
async function comprimirImagemParaBase64(file: File, maxWidth = 720, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(e.target?.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = String(e.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const PainelCadastroERelatorioFoto: React.FC<PainelCadastroERelatorioFotoProps> = ({
  bicos,
  tanques,
  afericoes,
  funcionarios,
  modoInicial = 'CADASTRO',
  onReload,
}) => {
  const { postoId, userProfile } = useAuth();
  const [secaoAtiva, setSecaoAtiva] = useState<'CADASTRO' | 'RELATORIO_FOTO'>(modoInicial);
  const [salvando, setSalvando] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Estados de Edição Rápida em Lote de Bicos e Tanques
  const [tanquesEditaveis, setTanquesEditaveis] = useState<Tanque[]>(tanques);
  const [bicosEditaveis, setBicosEditaveis] = useState<Bico[]>(bicos);

  React.useEffect(() => {
    setTanquesEditaveis(tanques);
  }, [tanques]);

  React.useEffect(() => {
    setBicosEditaveis([...bicos].sort((a, b) => a.numero - b.numero));
  }, [bicos]);

  // Estados do Leitor de Foto de Aferição (IA)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>('');
  const [analisandoFoto, setAnalisandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState('');
  const [resultadoFoto, setResultadoFoto] = useState<ResultadoOCRAfericao | null>(null);
  const [itensFotoEditaveis, setItensFotoEditaveis] = useState<ItemAfericaoExtraidaFoto[]>([]);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  // Filtros do Relatório de Aferição
  const [filtroBicoRelatorio, setFiltroBicoRelatorio] = useState<string>('TODOS');
  const [filtroApenasComFoto, setFiltroApenasComFoto] = useState<boolean>(false);

  const mostrarToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 5000);
  };

  // Adicionar linha de Tanque na grade editável
  const handleAdicionarLinhaTanque = () => {
    const proxNum = tanquesEditaveis.length + 1;
    const cod = `TQ-0${proxNum}`;
    const novoTq: Tanque = {
      id: `tq-${Date.now()}`,
      postoId,
      codigo: cod,
      produto: 'Gasolina Comum',
      capacidadeNominal: 20000,
      capacidadeOperacional: 19000,
      unidade: 'Litros',
      formato: 'CILINDRICO_HORIZONTAL',
      ativo: true,
      tabelaRegua: [
        { altura: 0, volume: 0 },
        { altura: 50, volume: 3600 },
        { altura: 100, volume: 9600 },
        { altura: 150, volume: 15600 },
        { altura: 200, volume: 20000 },
      ],
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    setTanquesEditaveis((prev) => [...prev, novoTq]);
  };

  // Adicionar linha de Bico na grade editável
  const handleAdicionarLinhaBico = () => {
    const proxNum =
      bicosEditaveis.length > 0 ? Math.max(...bicosEditaveis.map((b) => b.numero)) + 1 : 1;
    const tqPadrao = tanquesEditaveis[0];
    const prodPadrao = tqPadrao?.produto || 'Gasolina Comum';
    const precoPadrao = PRECOS_PADRAO_COMBUSTIVEL[prodPadrao] || 5.89;

    const novoBico: Bico = {
      id: `bico-${proxNum}-${Date.now()}`,
      postoId,
      numero: proxNum,
      bomba: proxNum <= 6 ? 'Bomba 01 (Sêxtupla - Ilha 01)' : 'Bomba 02 (Sêxtupla - Ilha 02)',
      tanqueId: tqPadrao?.id || '',
      tanqueCodigo: tqPadrao?.codigo || 'TQ-01',
      produto: prodPadrao,
      lado: proxNum % 2 === 1 ? 'A' : 'B',
      status: 'ATIVO',
      precoBase: precoPadrao,
      precoLitro: precoPadrao,
      temDesconto: false,
      ultimoEncerrante: 0,
      lacreBomba: `INM-${202600 + proxNum}`,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    setBicosEditaveis((prev) => [...prev, novoBico]);
  };

  // Gerar e Salvar Estrutura Completa (5 Tanques + 12 Bicos Vinculados) na Nuvem 24h
  const handleGerarESalvarCadastroPadrao = async () => {
    setSalvando(true);
    try {
      const padraoTanques: Array<{ id: string; cod: string; prod: string; capNom: number; capOp: number }> = [
        { id: 'tq-01', cod: 'TQ-01', prod: 'Gasolina Comum', capNom: 30000, capOp: 28500 },
        { id: 'tq-02', cod: 'TQ-02', prod: 'Gasolina Aditivada', capNom: 15000, capOp: 14250 },
        { id: 'tq-03', cod: 'TQ-03', prod: 'Etanol Hidratado', capNom: 20000, capOp: 19000 },
        { id: 'tq-04', cod: 'TQ-04', prod: 'Diesel S10', capNom: 30000, capOp: 28500 },
        { id: 'tq-05', cod: 'TQ-05', prod: 'Diesel S500', capNom: 15000, capOp: 14250 },
      ];

      const tanquesSalvos: Tanque[] = [];
      for (const item of padraoTanques) {
        const existente = tanques.find((t) => t.codigo === item.cod || t.produto === item.prod);
        const tId = existente?.id || item.id;
        const tabela: PontoCalibracao[] = existente?.tabelaRegua?.length
          ? existente.tabelaRegua
          : [
              { altura: 0, volume: 0 },
              { altura: 50, volume: Math.round(item.capNom * 0.18) },
              { altura: 100, volume: Math.round(item.capNom * 0.48) },
              { altura: 150, volume: Math.round(item.capNom * 0.78) },
              { altura: 200, volume: item.capNom },
            ];

        const tqObj: Tanque = {
          id: tId,
          postoId,
          codigo: item.cod,
          produto: item.prod,
          capacidadeNominal: item.capNom,
          capacidadeOperacional: item.capOp,
          unidade: 'Litros',
          formato: 'CILINDRICO_HORIZONTAL',
          ativo: true,
          tabelaRegua: tabela,
          criadoEm: existente?.criadoEm || new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        await repoTanques.save(postoId, tqObj);
        tanquesSalvos.push(tqObj);
      }

      const encontrarTanquePorProduto = (prod: string) => {
        return (
          tanquesSalvos.find((t) => t.produto.toLowerCase() === prod.toLowerCase()) ||
          tanquesSalvos[0]
        );
      };

      const padraoBicos = [
        { num: 1, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'A' as const, prod: 'Gasolina Comum', preco: 5.89 },
        { num: 2, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'A' as const, prod: 'Gasolina Aditivada', preco: 6.09 },
        { num: 3, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'A' as const, prod: 'Etanol Hidratado', preco: 3.99 },
        { num: 4, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'B' as const, prod: 'Gasolina Comum', preco: 5.89 },
        { num: 5, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'B' as const, prod: 'Gasolina Aditivada', preco: 6.09 },
        { num: 6, bomba: 'Bomba 01 (Sêxtupla - Ilha 01)', lado: 'B' as const, prod: 'Etanol Hidratado', preco: 3.99 },
        { num: 7, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'A' as const, prod: 'Gasolina Comum', preco: 5.89 },
        { num: 8, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'A' as const, prod: 'Etanol Hidratado', preco: 3.99 },
        { num: 9, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'A' as const, prod: 'Diesel S10', preco: 6.19 },
        { num: 10, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'B' as const, prod: 'Gasolina Comum', preco: 5.89 },
        { num: 11, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'B' as const, prod: 'Etanol Hidratado', preco: 3.99 },
        { num: 12, bomba: 'Bomba 02 (Sêxtupla - Ilha 02)', lado: 'B' as const, prod: 'Diesel S10', preco: 6.19 },
      ];

      for (const item of padraoBicos) {
        const existente = bicos.find((b) => b.numero === item.num);
        const tqVinc = encontrarTanquePorProduto(item.prod);
        const bicoObj: Bico = {
          ...(existente || {}),
          id: existente?.id || `bico-${item.num}`,
          postoId,
          numero: item.num,
          bomba: item.bomba,
          tanqueId: tqVinc.id,
          tanqueCodigo: tqVinc.codigo,
          produto: item.prod,
          lado: item.lado,
          status: 'ATIVO',
          precoBase: existente?.precoBase || item.preco,
          precoLitro: existente?.precoLitro || item.preco,
          temDesconto: existente?.temDesconto || false,
          ultimoEncerrante: existente?.ultimoEncerrante || 0,
          lacreBomba: existente?.lacreBomba || `INM-${202600 + item.num}`,
          criadoEm: existente?.criadoEm || new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        await repoBicos.save(postoId, bicoObj);
      }

      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'CADASTRO_BICOS_TANQUES',
        'BicosETanques',
        postoId,
        'CREATE',
        null,
        { tanques: tanquesSalvos.length, bicos: padraoBicos.length }
      );

      mostrarToast('Cadastro completo de 5 Tanques e 12 Bicos salvo com sucesso na Nuvem 24h!');
      onReload();
    } catch (err) {
      console.error('Erro ao salvar estrutura padrão:', err);
      alert('Erro ao salvar cadastro padrão na nuvem.');
    } finally {
      setSalvando(false);
    }
  };

  // Salvar todas as edições da tabela de Tanques e Bicos na Nuvem 24h
  const handleSalvarTodoCadastroNuvem = async () => {
    setSalvando(true);
    try {
      // 1. Salvar todos os tanques
      for (const tq of tanquesEditaveis) {
        await repoTanques.save(postoId, {
          ...tq,
          postoId,
          atualizadoEm: new Date().toISOString(),
        });
      }

      // 2. Salvar todos os bicos vinculando corretamente ao tanque correspondente
      for (const b of bicosEditaveis) {
        const tqMatch =
          tanquesEditaveis.find((t) => t.id === b.tanqueId) ||
          tanquesEditaveis.find((t) => t.produto.toLowerCase() === b.produto.toLowerCase()) ||
          tanquesEditaveis[0];

        await repoBicos.save(postoId, {
          ...b,
          postoId,
          tanqueId: tqMatch?.id || b.tanqueId || '',
          tanqueCodigo: tqMatch?.codigo || b.tanqueCodigo || '',
          precoLitro: b.precoLitro || b.precoBase || 5.89,
          precoBase: b.precoBase || b.precoLitro || 5.89,
          atualizadoEm: new Date().toISOString(),
        });
      }

      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'CADASTRO_BICOS_TANQUES',
        'BicosETanques',
        postoId,
        'UPDATE',
        null,
        { totalTanquesSalvos: tanquesEditaveis.length, totalBicosSalvos: bicosEditaveis.length }
      );

      mostrarToast(
        `Cadastro salvo na Nuvem 24h: ${tanquesEditaveis.length} Tanque(s) e ${bicosEditaveis.length} Bico(s) sincronizados!`
      );
      onReload();
    } catch (err) {
      console.error('Erro ao salvar cadastro de bicos e tanques:', err);
      alert('Erro ao salvar cadastro de bicos e tanques na nuvem.');
    } finally {
      setSalvando(false);
    }
  };

  // Processar Foto enviada para extrair informações de Aferição, Bicos e Tanques
  const handleSelecionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErroFoto('');
    setAnalisandoFoto(true);

    try {
      const base64Comprimido = await comprimirImagemParaBase64(file, 720, 0.75);
      setFotoPreview(base64Comprimido);

      const response = await fetch('/api/gemini/afericao-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Comprimido,
          mimeType: 'image/jpeg',
          bicosCadastrados: bicos.map((b) => ({
            id: b.id,
            numero: b.numero,
            bomba: b.bomba,
            lado: b.lado,
            produto: b.produto,
            tanqueId: b.tanqueId,
          })),
          tanquesCadastrados: tanques.map((t) => ({
            id: t.id,
            codigo: t.codigo,
            produto: t.produto,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao ler informações da foto.');
      }

      setResultadoFoto(data);
      setItensFotoEditaveis(
        Array.isArray(data.bicosEAfericoes) && data.bicosEAfericoes.length > 0
          ? data.bicosEAfericoes.map((item: any, idx: number) => ({
              numeroBico: Number(item.numeroBico) || idx + 1,
              bomba:
                item.bomba ||
                (Number(item.numeroBico) <= 6
                  ? 'Bomba 01 (Sêxtupla - Ilha 01)'
                  : 'Bomba 02 (Sêxtupla - Ilha 02)'),
              lado: item.lado === 'B' ? 'B' : 'A',
              produto: item.produto || 'Gasolina Comum',
              tanqueCodigo: item.tanqueCodigo || `TQ-0${(idx % 4) + 1}`,
              precoLitro: Number(item.precoLitro) || PRECOS_PADRAO_COMBUSTIVEL[item.produto] || 5.89,
              volumeNominal: 20.0,
              volumeAferido: Number(item.volumeAferido) || 20.0,
              desvioMl:
                item.desvioMl !== undefined
                  ? Number(item.desvioMl)
                  : Math.round(((Number(item.volumeAferido) || 20.0) - 20.0) * 1000),
              encerranteInicial: item.encerranteInicial ? Number(item.encerranteInicial) : undefined,
              encerranteFinal: item.encerranteFinal ? Number(item.encerranteFinal) : undefined,
              lacreInmetro: item.lacreInmetro || data.certificadoInmetro || '',
              temperaturaC: item.temperaturaC ? Number(item.temperaturaC) : undefined,
              resultado:
                Math.abs(
                  item.desvioMl !== undefined
                    ? Number(item.desvioMl)
                    : Math.round(((Number(item.volumeAferido) || 20.0) - 20.0) * 1000)
                ) <= 100
                  ? 'CONFORME'
                  : 'NAO_CONFORME',
              detalhesFotoBico: item.detalhesFotoBico || data.resumoGeralFoto || 'Extraído da foto via IA',
            }))
          : [
              {
                numeroBico: bicos[0]?.numero || 1,
                bomba: bicos[0]?.bomba || 'Bomba 01 (Sêxtupla - Ilha 01)',
                lado: bicos[0]?.lado || 'A',
                produto: bicos[0]?.produto || 'Gasolina Comum',
                tanqueCodigo: tanques[0]?.codigo || 'TQ-01',
                precoLitro: bicos[0]?.precoLitro || 5.89,
                volumeNominal: 20.0,
                volumeAferido: 20.0,
                desvioMl: 0,
                lacreInmetro: data.certificadoInmetro || '',
                resultado: 'CONFORME',
                detalhesFotoBico: data.resumoGeralFoto || 'Leitura visual da foto',
              },
            ]
      );
      mostrarToast('Informações da foto extraídas com sucesso! Confira abaixo e clique em Salvar.');
    } catch (err) {
      console.error('Erro no OCR de aferição:', err);
      setErroFoto(
        err instanceof Error
          ? err.message
          : 'Não foi possível ler automaticamente a foto. Você pode preencher os dados abaixo ao lado da foto.'
      );
      // Permite preenchimento assistido mesmo se o OCR falhar
      if (itensFotoEditaveis.length === 0) {
        setItensFotoEditaveis([
          {
            numeroBico: bicos[0]?.numero || 1,
            bomba: bicos[0]?.bomba || 'Bomba 01 (Sêxtupla - Ilha 01)',
            lado: bicos[0]?.lado || 'A',
            produto: bicos[0]?.produto || 'Gasolina Comum',
            tanqueCodigo: tanques[0]?.codigo || 'TQ-01',
            precoLitro: bicos[0]?.precoLitro || 5.89,
            volumeNominal: 20.0,
            volumeAferido: 20.0,
            desvioMl: 0,
            resultado: 'CONFORME',
            detalhesFotoBico: 'Registro com foto de evidência anexada',
          },
        ]);
      }
    } finally {
      setAnalisandoFoto(false);
    }
  };

  // Salvar Bicos, Tanques e Aferições extraídos da Foto na Nuvem 24h e atualizar Relatório
  const handleSalvarDadosDaFotoNaNuvem = async () => {
    if (itensFotoEditaveis.length === 0) return;
    setSalvando(true);

    try {
      const mapaTanques = new Map<string, Tanque>();
      tanques.forEach((t) => {
        mapaTanques.set(t.codigo.toUpperCase(), t);
        mapaTanques.set(t.produto.toLowerCase(), t);
      });

      // 1. Se a foto trouxe tanques novos ou se não existir tanque para o combustível do bico, cria/atualiza o tanque
      if (resultadoFoto?.tanquesExtraidos && resultadoFoto.tanquesExtraidos.length > 0) {
        for (const tExtraido of resultadoFoto.tanquesExtraidos) {
          const existente =
            mapaTanques.get((tExtraido.codigo || '').toUpperCase()) ||
            mapaTanques.get((tExtraido.produto || '').toLowerCase());
          const capNom = tExtraido.capacidadeNominal || existente?.capacidadeNominal || 20000;
          const capOp = tExtraido.capacidadeOperacional || existente?.capacidadeOperacional || Math.round(capNom * 0.95);
          const novoTq: Tanque = {
            id: existente?.id || `tq-${(tExtraido.codigo || `tq-${Date.now()}`).toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            postoId,
            codigo: tExtraido.codigo || existente?.codigo || 'TQ-01',
            produto: tExtraido.produto || existente?.produto || 'Gasolina Comum',
            capacidadeNominal: capNom,
            capacidadeOperacional: capOp,
            unidade: 'Litros',
            formato: 'CILINDRICO_HORIZONTAL',
            ativo: true,
            tabelaRegua: existente?.tabelaRegua || [
              { altura: 0, volume: 0 },
              { altura: 50, volume: Math.round(capNom * 0.18) },
              { altura: 100, volume: Math.round(capNom * 0.48) },
              { altura: 150, volume: Math.round(capNom * 0.78) },
              { altura: 200, volume: capNom },
            ],
            observacoes: tExtraido.observacoes || existente?.observacoes,
            criadoEm: existente?.criadoEm || new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          };
          await repoTanques.save(postoId, novoTq);
          mapaTanques.set(novoTq.codigo.toUpperCase(), novoTq);
          mapaTanques.set(novoTq.produto.toLowerCase(), novoTq);
        }
      }

      // 2. Para cada item da foto: garantir que Tanque e Bico estejam salvos na nuvem e criar o registro de Aferição com os dados da foto
      const dataAf = resultadoFoto?.dataIdentificada || new Date().toISOString().slice(0, 10);
      const horaAf =
        resultadoFoto?.horaIdentificada ||
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const equipAf = resultadoFoto?.equipamentoIdentificado || 'Medidor Padrão 20L Inmetro';
      const respNome =
        resultadoFoto?.responsavelIdentificado ||
        funcionarios[0]?.nome ||
        userProfile?.nome ||
        'Operador Técnico';

      for (const item of itensFotoEditaveis) {
        // Garantir tanque vinculado
        let tanqueVinc =
          mapaTanques.get((item.tanqueCodigo || '').toUpperCase()) ||
          mapaTanques.get(item.produto.toLowerCase());

        if (!tanqueVinc) {
          const codAuto = item.tanqueCodigo || `TQ-0${mapaTanques.size + 1}`;
          tanqueVinc = {
            id: `tq-${codAuto.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
            postoId,
            codigo: codAuto,
            produto: item.produto,
            capacidadeNominal: 20000,
            capacidadeOperacional: 19000,
            unidade: 'Litros',
            formato: 'CILINDRICO_HORIZONTAL',
            ativo: true,
            tabelaRegua: [
              { altura: 0, volume: 0 },
              { altura: 100, volume: 9600 },
              { altura: 200, volume: 20000 },
            ],
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          };
          await repoTanques.save(postoId, tanqueVinc);
          mapaTanques.set(tanqueVinc.codigo.toUpperCase(), tanqueVinc);
          mapaTanques.set(tanqueVinc.produto.toLowerCase(), tanqueVinc);
        }

        // Garantir bico salvo e atualizado
        const bicoExistente = bicos.find((b) => b.numero === item.numeroBico);
        const bicoId = bicoExistente?.id || `bico-${item.numeroBico}`;
        const bicoSalvo: Bico = {
          ...(bicoExistente || {}),
          id: bicoId,
          postoId,
          numero: item.numeroBico,
          bomba: item.bomba,
          tanqueId: tanqueVinc.id,
          tanqueCodigo: tanqueVinc.codigo,
          produto: item.produto,
          lado: item.lado,
          status: 'ATIVO',
          precoBase: item.precoLitro || bicoExistente?.precoBase || 5.89,
          precoLitro: item.precoLitro || bicoExistente?.precoLitro || 5.89,
          temDesconto: bicoExistente?.temDesconto || false,
          ultimoEncerrante: item.encerranteFinal ?? item.encerranteInicial ?? bicoExistente?.ultimoEncerrante,
          lacreBomba: item.lacreInmetro || bicoExistente?.lacreBomba,
          criadoEm: bicoExistente?.criadoEm || new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        await repoBicos.save(postoId, bicoSalvo);

        // Calcular aferição oficial 20L
        const calc = calcularAfericao(item.volumeAferido, 20.0, TOLERANCIA_DESVIO_PADRAO_L);
        const novaAf: Afericao = {
          id: `afericao-foto-${item.numeroBico}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          postoId,
          bicoId: bicoSalvo.id,
          bicoNumero: bicoSalvo.numero,
          bombaNome: bicoSalvo.bomba,
          ladoBomba: bicoSalvo.lado,
          tanqueId: tanqueVinc.id,
          tanqueCodigo: tanqueVinc.codigo,
          produto: bicoSalvo.produto,
          funcionarioId: funcionarios[0]?.id || 'resp-foto',
          responsavelNome: respNome,
          data: dataAf,
          hora: horaAf,
          volumeNominal: 20.0,
          volumeAferido: item.volumeAferido,
          diferenca: calc.diferenca,
          toleranciaConfigurada: TOLERANCIA_DESVIO_PADRAO_L,
          resultado: calc.resultado,
          equipamento: equipAf,
          encerranteInicial: item.encerranteInicial,
          encerranteFinal: item.encerranteFinal,
          lacreInmetro: item.lacreInmetro || resultadoFoto?.certificadoInmetro,
          certificadoMedidor: resultadoFoto?.certificadoInmetro,
          temperaturaC: item.temperaturaC,
          fotoEvidenciaBase64: fotoPreview || undefined,
          resumoFotoIA: item.detalhesFotoBico || resultadoFoto?.resumoGeralFoto,
          origemRegistro: 'FOTO_IA',
          observacao: item.detalhesFotoBico || resultadoFoto?.resumoGeralFoto || 'Extraído de foto',
          criadoEm: new Date().toISOString(),
        };

        await repoAfericoes.save(postoId, novaAf);
      }

      await registrarAuditoria(
        postoId,
        userProfile?.uid || 'anon',
        userProfile?.nome || 'Operador',
        'AFERICOES_FOTO',
        'Afericao',
        postoId,
        'CREATE',
        null,
        {
          quantidadeAfericoesFoto: itensFotoEditaveis.length,
          documentoFoto: resultadoFoto?.tituloDocumento,
        }
      );

      mostrarToast(
        `${itensFotoEditaveis.length} aferição(ões), bicos e tanques da foto salvos na Nuvem 24h e incluídos no relatório abaixo!`
      );
      onReload();
    } catch (err) {
      console.error('Erro ao salvar dados da foto:', err);
      alert('Erro ao salvar aferições da foto na nuvem.');
    } finally {
      setSalvando(false);
    }
  };

  // Aferições filtradas para o Relatório
  const afericoesRelatorio = afericoes
    .filter((a) => {
      if (filtroBicoRelatorio !== 'TODOS' && a.bicoId !== filtroBicoRelatorio) return false;
      if (filtroApenasComFoto && !a.fotoEvidenciaBase64 && !a.resumoFotoIA) return false;
      return true;
    })
    .sort((x, y) => `${y.data}T${y.hora}`.localeCompare(`${x.data}T${x.hora}`));

  const exportarRelatorioAfericaoCSV = () => {
    const cabecalho = [
      'Data',
      'Hora',
      'Origem',
      'Bico',
      'Bomba',
      'Lado',
      'Tanque',
      'Combustivel',
      'Encerrante_Inicial',
      'Encerrante_Final',
      'Volume_Nominal_L',
      'Volume_Aferido_L',
      'Desvio_ml',
      'Tolerancia_Inmetro_ml',
      'Status_Inmetro',
      'Lacre_Certificado',
      'Responsavel',
      'Informacoes_da_Foto_Observacoes',
    ];

    const linhas = afericoesRelatorio.map((a) => {
      const bicoObj = bicos.find((b) => b.id === a.bicoId);
      const tqObj = tanques.find((t) => t.id === a.tanqueId || t.id === bicoObj?.tanqueId);
      const funcObj = funcionarios.find((f) => f.id === a.funcionarioId);
      const diffMl = Math.round(a.diferenca * 1000);
      return [
        a.data,
        a.hora,
        a.origemRegistro === 'FOTO_IA' || a.fotoEvidenciaBase64 ? 'FOTO_IA' : 'MANUAL',
        `Bico ${a.bicoNumero || bicoObj?.numero || '-'}`,
        a.bombaNome || bicoObj?.bomba || 'Bomba 01',
        a.ladoBomba || bicoObj?.lado || 'A',
        a.tanqueCodigo || tqObj?.codigo || 'TQ-01',
        a.produto,
        a.encerranteInicial !== undefined ? String(a.encerranteInicial) : '-',
        a.encerranteFinal !== undefined ? String(a.encerranteFinal) : '-',
        a.volumeNominal.toFixed(3),
        a.volumeAferido.toFixed(3),
        `${diffMl > 0 ? `+${diffMl}` : diffMl}`,
        '±100',
        a.resultado,
        a.lacreInmetro || bicoObj?.lacreBomba || '-',
        a.responsavelNome || funcObj?.nome || 'Operador',
        (a.resumoFotoIA || a.observacao || '').replace(/;/g, ','),
      ];
    });

    const csv = 'data:text/csv;charset=utf-8,' + encodeURI([cabecalho, ...linhas].map((r) => r.join(';')).join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csv);
    link.setAttribute('download', `relatorio_afericoes_foto_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Alerta de confirmação */}
      {toastMsg && (
        <div className="bg-emerald-950 text-emerald-200 border border-emerald-700 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-md print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button type="button" onClick={() => setToastMsg('')} className="text-emerald-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Seletor Interno: Cadastro de Bicos e Tanques vs Relatório de Aferição com Foto */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSecaoAtiva('CADASTRO')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              secaoAtiva === 'CADASTRO'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Database className="w-4 h-4 text-amber-400" />
            <span>1. Salvar Cadastro de Bicos e Tanques ({bicos.length} Bicos • {tanques.length} Tanques)</span>
          </button>

          <button
            type="button"
            onClick={() => setSecaoAtiva('RELATORIO_FOTO')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              secaoAtiva === 'RELATORIO_FOTO'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>2. Gerar Relatório de Aferição com Informações da Foto ({afericoes.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Relatório / PDF
          </button>
        </div>
      </div>

      {/* =====================================================================
          SEÇÃO 1: SALVAR CADASTRO DE BICOS E TANQUES NA NUVEM 24H
      ===================================================================== */}
      {secaoAtiva === 'CADASTRO' && (
        <div className="space-y-6">
          {/* Barra Principal de Salvamento */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-md">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold uppercase">
                  Nuvem 24h Conectada
                </span>
                <h3 className="text-base font-extrabold text-white">
                  Central de Cadastro Integrado: Tanques & Bicos da Pista
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Cadastre ou edite seus Tanques e Bicos abaixo e clique em <strong>Salvar Cadastro de Bicos e Tanques</strong> para gravar permanentemente no banco em nuvem.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleGerarESalvarCadastroPadrao}
                disabled={salvando}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title="Criar e salvar 5 Tanques + 12 Bicos (2 Bombas Sêxtuplas) automaticamente"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar 5 Tanques + 12 Bicos Padrão
              </button>

              <button
                type="button"
                onClick={handleSalvarTodoCadastroNuvem}
                disabled={salvando}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold transition shadow-md cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {salvando ? 'Salvando na Nuvem...' : 'Salvar Cadastro de Bicos e Tanques'}
              </button>
            </div>
          </div>

          {/* 1.1 Grade Editável de TANQUES */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  1. Tanques de Combustível ({tanquesEditaveis.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={handleAdicionarLinhaTanque}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Tanque
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                  <tr>
                    <th className="px-4 py-2.5">Código</th>
                    <th className="px-4 py-2.5">Combustível / Produto</th>
                    <th className="px-4 py-2.5">Cap. Nominal (L)</th>
                    <th className="px-4 py-2.5">Cap. Operacional (L)</th>
                    <th className="px-4 py-2.5">Observações</th>
                    <th className="px-4 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {tanquesEditaveis.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        Nenhum tanque listado. Clique em &ldquo;Adicionar Tanque&rdquo; ou &ldquo;Gerar 5 Tanques + 12 Bicos Padrão&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    tanquesEditaveis.map((tq, idx) => (
                      <tr key={tq.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={tq.codigo}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTanquesEditaveis((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, codigo: val } : item))
                              );
                            }}
                            className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={tq.produto}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTanquesEditaveis((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, produto: val } : item))
                              );
                            }}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold bg-white text-slate-900"
                          >
                            <option value="Gasolina Comum">Gasolina Comum</option>
                            <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                            <option value="Etanol Hidratado">Etanol Hidratado</option>
                            <option value="Etanol">Etanol</option>
                            <option value="Diesel S10">Diesel S10</option>
                            <option value="Diesel S500">Diesel S500</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={tq.capacidadeNominal}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setTanquesEditaveis((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        capacidadeNominal: val,
                                        capacidadeOperacional: Math.round(val * 0.95),
                                      }
                                    : item
                                )
                              );
                            }}
                            className="w-28 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={tq.capacidadeOperacional}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setTanquesEditaveis((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, capacidadeOperacional: val } : item
                                )
                              );
                            }}
                            className="w-28 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            placeholder="Ex: Subterrâneo jaquetado"
                            value={tq.observacoes || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTanquesEditaveis((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, observacoes: val } : item))
                              );
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              if (tanques.some((t) => t.id === tq.id)) {
                                await repoTanques.delete(postoId, tq.id);
                                onReload();
                              }
                              setTanquesEditaveis((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            title="Remover tanque"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 1.2 Grade Editável de BICOS */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  2. Bicos das Bombas Vinculados aos Tanques ({bicosEditaveis.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={handleAdicionarLinhaBico}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Bico
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                  <tr>
                    <th className="px-3 py-2.5">Nº Bico</th>
                    <th className="px-3 py-2.5">Bomba / Ilha</th>
                    <th className="px-3 py-2.5">Lado</th>
                    <th className="px-3 py-2.5">Combustível</th>
                    <th className="px-3 py-2.5">Tanque Vinculado</th>
                    <th className="px-3 py-2.5">Preço (R$/L)</th>
                    <th className="px-3 py-2.5">Encerrante Atual</th>
                    <th className="px-3 py-2.5">Lacre Inmetro</th>
                    <th className="px-3 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bicosEditaveis.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                        Nenhum bico listado. Clique em &ldquo;Adicionar Bico&rdquo; ou &ldquo;Gerar 5 Tanques + 12 Bicos Padrão&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    bicosEditaveis.map((b, idx) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={b.numero}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 1;
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, numero: val } : item))
                              );
                            }}
                            className="w-16 px-2 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-center"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={b.bomba}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, bomba: val } : item))
                              );
                            }}
                            className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
                          >
                            <option value="Bomba 01 (Sêxtupla - Ilha 01)">Bomba 01 (Sêxtupla - Ilha 01)</option>
                            <option value="Bomba 02 (Sêxtupla - Ilha 02)">Bomba 02 (Sêxtupla - Ilha 02)</option>
                            <option value="Bomba 03 (Ilha 03)">Bomba 03 (Ilha 03)</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={b.lado}
                            onChange={(e) => {
                              const val = e.target.value as 'A' | 'B';
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, lado: val } : item))
                              );
                            }}
                            className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white font-bold"
                          >
                            <option value="A">Lado A</option>
                            <option value="B">Lado B</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={b.produto}
                            onChange={(e) => {
                              const prod = e.target.value;
                              const tqSugerido = tanquesEditaveis.find(
                                (t) => t.produto.toLowerCase() === prod.toLowerCase()
                              );
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        produto: prod,
                                        tanqueId: tqSugerido?.id || item.tanqueId,
                                        tanqueCodigo: tqSugerido?.codigo || item.tanqueCodigo,
                                      }
                                    : item
                                )
                              );
                            }}
                            className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold"
                          >
                            <option value="Gasolina Comum">Gasolina Comum</option>
                            <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                            <option value="Etanol Hidratado">Etanol Hidratado</option>
                            <option value="Diesel S10">Diesel S10</option>
                            <option value="Diesel S500">Diesel S500</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={b.tanqueId}
                            onChange={(e) => {
                              const tId = e.target.value;
                              const tObj = tanquesEditaveis.find((t) => t.id === tId);
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        tanqueId: tId,
                                        tanqueCodigo: tObj?.codigo || '',
                                      }
                                    : item
                                )
                              );
                            }}
                            className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                          >
                            <option value="">Auto-Vincular por Produto</option>
                            {tanquesEditaveis.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.codigo} ({t.produto})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={b.precoLitro || b.precoBase || 5.89}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, precoBase: val, precoLitro: val } : item
                                )
                              );
                            }}
                            className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={b.ultimoEncerrante ?? ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, ultimoEncerrante: val } : item
                                )
                              );
                            }}
                            className="w-28 px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="Nº Lacre"
                            value={b.lacreBomba || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBicosEditaveis((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, lacreBomba: val } : item))
                              );
                            }}
                            className="w-28 px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              if (bicos.some((item) => item.id === b.id)) {
                                await repoBicos.delete(postoId, b.id);
                                onReload();
                              }
                              setBicosEditaveis((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            title="Remover bico"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={handleSalvarTodoCadastroNuvem}
                disabled={salvando}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {salvando ? 'Salvando na Nuvem...' : 'Salvar Cadastro de Bicos e Tanques na Nuvem'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SEÇÃO 2: LEITOR DE FOTO DE AFERIÇÃO (IA) & RELATÓRIO DE AFERIÇÃO
      ===================================================================== */}
      {secaoAtiva === 'RELATORIO_FOTO' && (
        <div className="space-y-6">
          {/* Painel de Upload e Extração de Foto da Aferição (Oculto na impressão) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 print:hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-xs shrink-0">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Leitor Inteligente de Foto de Aferição, Bombas e Tanques (IA)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Envie a foto do relatório de aferição, visor da bomba, escala do balde de 20L ou tabela de bicos/tanques para extrair os dados e gerar o relatório oficial.
                  </p>
                </div>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSelecionarFoto}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analisandoFoto}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {analisandoFoto ? 'Lendo Informações da Foto...' : 'Enviar / Ler Foto de Aferição'}
                </button>
              </div>
            </div>

            {erroFoto && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{erroFoto}</span>
              </div>
            )}

            {/* Preview da Foto + Dados Extraídos da Foto para Conferência e Salvamento */}
            {(fotoPreview || itensFotoEditaveis.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
                {/* Miniatura da Foto Carregada */}
                <div className="lg:col-span-4 space-y-3">
                  <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-white">
                    <div className="text-[11px] font-bold uppercase text-amber-400 mb-2 flex items-center justify-between">
                      <span>Foto de Evidência Anexada</span>
                      {fotoPreview && (
                        <button
                          type="button"
                          onClick={() => setFotoAmpliada(fotoPreview)}
                          className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ampliar
                        </button>
                      )}
                    </div>
                    {fotoPreview ? (
                      <img
                        src={fotoPreview}
                        alt="Foto da aferição"
                        className="w-full max-h-64 object-contain rounded-lg bg-slate-950 border border-slate-800"
                      />
                    ) : (
                      <div className="h-40 flex items-center justify-center text-xs text-slate-500">
                        Sem imagem selecionada
                      </div>
                    )}
                    {resultadoFoto && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-1 text-xs">
                        <div className="font-bold text-amber-300">{resultadoFoto.tituloDocumento}</div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          {resultadoFoto.resumoGeralFoto}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabela Editável das Aferições Extraídas da Foto */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      Informações Extraídas da Foto ({itensFotoEditaveis.length} Bico(s) / Aferição(ões))
                    </h4>
                    <button
                      type="button"
                      onClick={() =>
                        setItensFotoEditaveis((prev) => [
                          ...prev,
                          {
                            numeroBico: prev.length + 1,
                            bomba: 'Bomba 01 (Sêxtupla - Ilha 01)',
                            lado: 'A',
                            produto: 'Gasolina Comum',
                            tanqueCodigo: 'TQ-01',
                            precoLitro: 5.89,
                            volumeNominal: 20.0,
                            volumeAferido: 20.0,
                            desvioMl: 0,
                            resultado: 'CONFORME',
                            detalhesFotoBico: 'Adicionado manualmente ao lote da foto',
                          },
                        ])
                      }
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> + Adicionar linha ao lote da foto
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                        <tr>
                          <th className="px-2.5 py-2">Bico</th>
                          <th className="px-2.5 py-2">Combustível</th>
                          <th className="px-2.5 py-2">Tanque</th>
                          <th className="px-2.5 py-2">Vol. Balde (L)</th>
                          <th className="px-2.5 py-2">Desvio (ml)</th>
                          <th className="px-2.5 py-2">Encerrante Final</th>
                          <th className="px-2.5 py-2">Lacre / Detalhes da Foto</th>
                          <th className="px-2.5 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {itensFotoEditaveis.map((item, idx) => (
                          <tr key={idx} className="bg-white">
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                value={item.numeroBico}
                                onChange={(e) => {
                                  const num = Number(e.target.value) || 1;
                                  setItensFotoEditaveis((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, numeroBico: num } : it))
                                  );
                                }}
                                className="w-14 px-2 py-1 border border-slate-300 rounded font-mono font-bold"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <select
                                value={item.produto}
                                onChange={(e) => {
                                  const prod = e.target.value;
                                  setItensFotoEditaveis((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, produto: prod } : it))
                                  );
                                }}
                                className="px-2 py-1 border border-slate-300 rounded bg-white font-semibold"
                              >
                                <option value="Gasolina Comum">Gasolina Comum</option>
                                <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                                <option value="Etanol Hidratado">Etanol Hidratado</option>
                                <option value="Diesel S10">Diesel S10</option>
                                <option value="Diesel S500">Diesel S500</option>
                              </select>
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="text"
                                value={item.tanqueCodigo}
                                onChange={(e) => {
                                  const cod = e.target.value;
                                  setItensFotoEditaveis((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, tanqueCodigo: cod } : it))
                                  );
                                }}
                                className="w-16 px-2 py-1 border border-slate-300 rounded font-mono"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                step="0.001"
                                value={item.volumeAferido}
                                onChange={(e) => {
                                  const vol = parseFloat(e.target.value) || 20.0;
                                  const ml = Math.round((vol - 20.0) * 1000);
                                  setItensFotoEditaveis((prev) =>
                                    prev.map((it, i) =>
                                      i === idx
                                        ? {
                                            ...it,
                                            volumeAferido: vol,
                                            desvioMl: ml,
                                            resultado: Math.abs(ml) <= 100 ? 'CONFORME' : 'NAO_CONFORME',
                                          }
                                        : it
                                    )
                                  );
                                }}
                                className="w-20 px-2 py-1 border border-slate-300 rounded font-mono font-bold"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                value={item.desvioMl}
                                onChange={(e) => {
                                  const ml = parseInt(e.target.value, 10) || 0;
                                  const vol = Number((20.0 + ml / 1000).toFixed(3));
                                  setItensFotoEditaveis((prev) =>
                                    prev.map((it, i) =>
                                      i === idx
                                        ? {
                                            ...it,
                                            desvioMl: ml,
                                            volumeAferido: vol,
                                            resultado: Math.abs(ml) <= 100 ? 'CONFORME' : 'NAO_CONFORME',
                                          }
                                        : it
                                    )
                                  );
                                }}
                                className={`w-16 px-2 py-1 border rounded font-mono font-bold ${
                                  Math.abs(item.desvioMl) <= 100
                                    ? 'border-emerald-300 text-emerald-800 bg-emerald-50'
                                    : 'border-red-300 text-red-800 bg-red-50'
                                }`}
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Encerrante"
                                value={item.encerranteFinal ?? ''}
                                onChange={(e) => {
                                  const enc = parseFloat(e.target.value) || undefined;
                                  setItensFotoEditaveis((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, encerranteFinal: enc } : it))
                                  );
                                }}
                                className="w-24 px-2 py-1 border border-slate-300 rounded font-mono"
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <input
                                type="text"
                                placeholder="Detalhes lidos na foto"
                                value={item.detalhesFotoBico || ''}
                                onChange={(e) => {
                                  const det = e.target.value;
                                  setItensFotoEditaveis((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, detalhesFotoBico: det } : it))
                                  );
                                }}
                                className="w-full min-w-[140px] px-2 py-1 border border-slate-300 rounded"
                              />
                            </td>
                            <td className="px-2.5 py-2 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setItensFotoEditaveis((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-slate-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSalvarDadosDaFotoNaNuvem}
                      disabled={salvando}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {salvando
                        ? 'Salvando na Nuvem...'
                        : 'Salvar Cadastro (Bicos/Tanques) + Aferições da Foto e Gerar Relatório'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* =====================================================================
              RELATÓRIO OFICIAL DE AFERIÇÃO COM INFORMAÇÕES DA FOTO (IMPRIMÍVEL)
          ===================================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm print:shadow-none print:border-none space-y-6">
            {/* Cabeçalho Oficial do Relatório */}
            <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-amber-700">
                  DOCUMENTO METROLÓGICO OFICIAL • PADRÃO INMETRO 20,000 LITROS (±100 ml)
                </div>
                <h2 className="text-xl font-black text-slate-900 uppercase mt-0.5">
                  RELATÓRIO TÉCNICO DE AFERIÇÃO DE BICOS, BOMBAS E TANQUES
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Posto Conectado 24h na Nuvem • Emitido em: {new Date().toLocaleString('pt-BR')} • Responsável:{' '}
                  <strong>{userProfile?.nome || 'Gerência Operacional'}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <select
                  value={filtroBicoRelatorio}
                  onChange={(e) => setFiltroBicoRelatorio(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                >
                  <option value="TODOS">Todos os Bicos ({bicos.length})</option>
                  {bicos.map((b) => (
                    <option key={b.id} value={b.id}>
                      Bico {b.numero} — {b.produto}
                    </option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filtroApenasComFoto}
                    onChange={(e) => setFiltroApenasComFoto(e.target.checked)}
                  />
                  Apenas com Foto
                </label>

                <button
                  type="button"
                  onClick={exportarRelatorioAfericaoCSV}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar CSV
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir / PDF
                </button>
              </div>
            </div>

            {/* Resumo Executivo do Relatório */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Bicos & Tanques Cadastrados
                </span>
                <div className="text-lg font-black font-mono text-slate-900 mt-0.5">
                  {bicos.length} Bicos • {tanques.length} Tanques
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                  Aferições Conformes (±100ml)
                </span>
                <div className="text-lg font-black font-mono text-emerald-700 mt-0.5">
                  {afericoesRelatorio.filter((a) => a.resultado === 'CONFORME').length} /{' '}
                  {afericoesRelatorio.length}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200">
                <span className="text-[10px] font-bold uppercase text-amber-900 block">
                  Registros com Dados de Foto
                </span>
                <div className="text-lg font-black font-mono text-amber-800 mt-0.5">
                  {
                    afericoesRelatorio.filter(
                      (a) => a.fotoEvidenciaBase64 || a.resumoFotoIA || a.origemRegistro === 'FOTO_IA'
                    ).length
                  }
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200">
                <span className="text-[10px] font-bold uppercase text-blue-800 block">
                  Volume Total Aferido (Retorno)
                </span>
                <div className="text-lg font-black font-mono text-blue-900 mt-0.5">
                  {afericoesRelatorio.reduce((acc, a) => acc + a.volumeAferido, 0).toFixed(3)} L
                </div>
              </div>
            </div>

            {/* Quadro 1: Cadastro Atual de Bicos e Tanques Vinculados */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Fuel className="w-4 h-4 text-amber-600" />
                1. Quadro de Cadastro de Bicos e Tanques Vinculados na Pista
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="px-3 py-2">Bico</th>
                      <th className="px-3 py-2">Bomba / Ilha</th>
                      <th className="px-3 py-2">Lado</th>
                      <th className="px-3 py-2">Combustível</th>
                      <th className="px-3 py-2">Tanque Vinculado</th>
                      <th className="px-3 py-2 text-right">Capacidade Tanque</th>
                      <th className="px-3 py-2 text-right">Preço/L</th>
                      <th className="px-3 py-2 text-right">Encerrante Atual</th>
                      <th className="px-3 py-2">Lacre Bomba</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bicos.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-4 text-center text-slate-400">
                          Nenhum bico cadastrado no momento.
                        </td>
                      </tr>
                    ) : (
                      [...bicos]
                        .sort((a, b) => a.numero - b.numero)
                        .map((b) => {
                          const tq =
                            tanques.find((t) => t.id === b.tanqueId) ||
                            tanques.find((t) => t.produto.toLowerCase() === b.produto.toLowerCase());
                          return (
                            <tr key={b.id}>
                              <td className="px-3 py-1.5 font-mono font-bold text-slate-900">
                                Bico #{String(b.numero).padStart(2, '0')}
                              </td>
                              <td className="px-3 py-1.5">{b.bomba}</td>
                              <td className="px-3 py-1.5 font-mono font-bold">Lado {b.lado}</td>
                              <td className="px-3 py-1.5 font-semibold">{b.produto}</td>
                              <td className="px-3 py-1.5 font-mono font-bold text-blue-700">
                                {tq ? `${tq.codigo} (${tq.produto})` : b.tanqueCodigo || 'TQ-01'}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono">
                                {tq ? `${tq.capacidadeNominal.toLocaleString('pt-BR')} L` : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-bold">
                                {formatarPrecoLitro(b.precoLitro || b.precoBase || 5.89, 3)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono">
                                {b.ultimoEncerrante ? b.ultimoEncerrante.toLocaleString('pt-BR') : '—'}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-slate-600">
                                {b.lacreBomba || '—'}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quadro 2: Tabela Detalhada de Aferições com Informações da Foto */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-emerald-600" />
                2. Registros de Aferição Metrológica (20L) e Informações Extraídas da Foto
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="px-3 py-2">Foto</th>
                      <th className="px-3 py-2">Data / Hora</th>
                      <th className="px-3 py-2">Bico / Bomba</th>
                      <th className="px-3 py-2">Tanque / Combustível</th>
                      <th className="px-3 py-2 text-right">Encerrante</th>
                      <th className="px-3 py-2 text-right">Vol. Lido (20L)</th>
                      <th className="px-3 py-2 text-right">Desvio (ml)</th>
                      <th className="px-3 py-2">Informações da Foto / Lacre / Obs.</th>
                      <th className="px-3 py-2 text-center">Parecer Inmetro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {afericoesRelatorio.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                          Nenhuma aferição registrada para os filtros atuais. Envie uma foto acima ou registre uma aferição de 20L.
                        </td>
                      </tr>
                    ) : (
                      afericoesRelatorio.map((a) => {
                        const bicoObj = bicos.find((b) => b.id === a.bicoId);
                        const tqObj =
                          tanques.find((t) => t.id === a.tanqueId || t.id === bicoObj?.tanqueId) ||
                          tanques.find((t) => t.produto.toLowerCase() === a.produto.toLowerCase());
                        const diffMl = Math.round(a.diferenca * 1000);
                        const isOk = Math.abs(diffMl) <= Math.round((a.toleranciaConfigurada || 0.1) * 1000);

                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              {a.fotoEvidenciaBase64 ? (
                                <button
                                  type="button"
                                  onClick={() => setFotoAmpliada(a.fotoEvidenciaBase64!)}
                                  className="block w-12 h-10 rounded border border-slate-300 overflow-hidden bg-slate-950 hover:ring-2 hover:ring-amber-500 transition"
                                  title="Clique para ampliar a foto da aferição"
                                >
                                  <img
                                    src={a.fotoEvidenciaBase64}
                                    alt="Evidência"
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-400">Manual</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono whitespace-nowrap">
                              <div>{a.data}</div>
                              <div className="text-[10px] text-slate-500">{a.hora}</div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-bold text-slate-900">
                                Bico #{String(a.bicoNumero || bicoObj?.numero || '01').padStart(2, '0')} (Lado{' '}
                                {a.ladoBomba || bicoObj?.lado || 'A'})
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {a.bombaNome || bicoObj?.bomba || 'Bomba 01'}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-800">{a.produto}</div>
                              <div className="text-[10px] font-mono text-blue-700 font-bold">
                                {a.tanqueCodigo || tqObj?.codigo || 'TQ-01'}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {a.encerranteFinal !== undefined
                                ? a.encerranteFinal.toLocaleString('pt-BR')
                                : bicoObj?.ultimoEncerrante
                                ? bicoObj.ultimoEncerrante.toLocaleString('pt-BR')
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                              {a.volumeAferido.toFixed(3)} L
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-extrabold ${
                                isOk ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {diffMl > 0 ? `+${diffMl}` : diffMl} ml
                            </td>
                            <td className="px-3 py-2 max-w-xs">
                              <div className="text-slate-800 font-medium leading-snug">
                                {a.resumoFotoIA || a.observacao || a.equipamento}
                              </div>
                              {a.lacreInmetro && (
                                <div className="text-[10px] font-mono text-slate-500">
                                  Lacre/Cert.: {a.lacreInmetro}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {isOk ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px]">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> CONFORME
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200 font-bold text-[10px]">
                                  <XCircle className="w-3 h-3 text-red-600" /> FORA ±100ml
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Assinaturas Técnicas para Impressão */}
            <div className="pt-8 mt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center text-xs text-slate-600">
              <div className="pt-6 border-t border-slate-400">
                <div className="font-bold text-slate-900">Responsável pela Aferição / Operador</div>
                <div className="text-[11px] text-slate-500">Medidor Padrão 20,000L Certificado Inmetro</div>
              </div>
              <div className="pt-6 border-t border-slate-400">
                <div className="font-bold text-slate-900">
                  {userProfile?.nome || 'Gerente Geral / Responsável Legal'}
                </div>
                <div className="text-[11px] text-slate-500">Conferência Metrológica e Fiscal ANP / Inmetro</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Ampliar Foto de Evidência */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          onClick={() => setFotoAmpliada(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-white">
              <span className="text-sm font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" /> Foto de Evidência da Aferição
              </span>
              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-xs"
              >
                Fechar ✕
              </button>
            </div>
            <img
              src={fotoAmpliada}
              alt="Foto Ampliada"
              className="w-full max-h-[78vh] object-contain rounded-xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
};
