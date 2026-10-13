import Button from '../src/components/ActionButton';
import { colors } from '../src/theme';
import BancosTeste from '../src/components/BancosTeste';
import LancamentosPorDia from '../src/components/LancamentosPorDia';
import { dataValida, montarCsv, resumoMensal, valorEmCentavos } from '../src/domain/finance';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ActivityIndicator, Alert, Platform, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../src/lib/supabase';


type Tipo = 'income' | 'expense';
type Categoria = { id: string; name: string; type: Tipo };
type Lancamento = {
  id: string; description: string; amount: number; date: string;
  type: Tipo; category_id: string;
  source?: 'manual' | 'open_finance';
  account_name?: string | null;
};

function hojeLocal() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}
function moeda(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [iniciando, setIniciando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [tipo, setTipo] = useState<Tipo>('expense');
  const [categoriaId, setCategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeLocal());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoImportado, setEditandoImportado] = useState(false);
  const [mes, setMes] = useState(hojeLocal().slice(0, 7));
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'all' | Tipo>('all');
  const usuarioId = session?.user.id;

  useEffect(() => {
    let ativo = true;
    void supabase.auth.getSession().then(({ data: resultado, error }) => {
      if (!ativo) return;
      if (error) setMensagem(error.message);
      setSession(resultado.session);
      setIniciando(false);
    }).catch((error: unknown) => {
      if (!ativo) return;
      setMensagem(error instanceof Error ? error.message : 'Falha ao iniciar sessão.');
      setIniciando(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSession) => {
      setSession(novaSession);
    });
    return () => { ativo = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!usuarioId) {
      setCategorias([]); setLancamentos([]); setCategoriaId(''); setEditandoId(null);
      return;
    }
    let ativo = true;
    async function carregar() {
      const [cats, trans] = await Promise.all([
        supabase.from('categories').select('id, name, type').order('name'),
        supabase.from('transactions')
          .select('id, description, amount, date, type, category_id, source, account_name')
          .eq('user_id', usuarioId!).order('date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      if (!ativo) return;
      if (cats.error) setMensagem(`Erro nas categorias: ${cats.error.message}`);
      else setCategorias((cats.data ?? []) as Categoria[]);
      if (trans.error) setMensagem(`Erro nos lançamentos: ${trans.error.message}`);
      else setLancamentos((trans.data ?? []) as Lancamento[]);
    }
    void carregar().catch((error: unknown) => {
      if (ativo) setMensagem(error instanceof Error ? error.message : 'Falha ao carregar dados.');
    });
    return () => { ativo = false; };
  }, [usuarioId]);

  const categoriasDoTipo = categorias.filter((c) => c.type === tipo);
  const categoriaSelecionada = categoriasDoTipo.some((c) => c.id === categoriaId)
    ? categoriaId : '';
  const mesValido = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  const doMes = useMemo(() => mesValido
    ? lancamentos.filter((item) => item.date.slice(0, 7) === mes) : [],
    [lancamentos, mes, mesValido]);
  const { receitas, despesas } = resumoMensal(lancamentos, mes);
  const gastosPorCategoria = categorias.filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, nome: c.name,
      valor: doMes.filter((t) => t.type === 'expense' && t.category_id === c.id)
        .reduce((n, t) => n + Number(t.amount), 0) }))
    .filter((c) => c.valor > 0);
  const cores = ['#38BDF8', '#F43F5E', '#FBBF24', '#10B981', '#A855F7', '#6366F1', '#EC4899', '#06B6D4', '#84CC16'];
  let angulo = 0;
  const fatias = gastosPorCategoria.map((c, i) => {
    const inicio = angulo;
    const proporcao = despesas > 0 ? c.valor / despesas : 0;
    angulo += proporcao;
    return { ...c, inicio, proporcao, cor: cores[i % cores.length] };
  });
  const exibidos = doMes.filter((item) =>
    (filtro === 'all' || item.type === filtro) &&
    item.description.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'))
  );

  async function exportarCsv() {
    if (!usuarioId || !mesValido) return;
    setOcupado(true); setMensagem('');
    try {
      // Fetch the entire selected month, not just the locally cached first page.
      const inicio = `${mes}-01`;
      const proximo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1))
        .toISOString().slice(0, 10);
      const itens: Lancamento[] = [];
      for (let pagina = 0; ; pagina++) {
        const { data: lote, error } = await supabase.from('transactions')
          .select('id, description, amount, date, type, category_id, source, account_name')
          .eq('user_id', usuarioId).gte('date', inicio).lt('date', proximo)
          .order('date', { ascending: false }).order('id')
          .range(pagina * 500, pagina * 500 + 499);
        if (error) throw new Error(error.message);
        itens.push(...((lote ?? []) as Lancamento[]));
        if ((lote ?? []).length < 500) break;
      }
      const csv = montarCsv(itens, categorias);
      const nome = `fintrack-${mes}.csv`;
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = nome; document.body.appendChild(link);
        link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível neste dispositivo.');
        const arquivo = new File(Paths.cache, nome);
        arquivo.create({ overwrite: true });
        arquivo.write(csv);
        await Sharing.shareAsync(arquivo.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar FinTrack' });
      }
      setMensagem(`CSV preparado: ${itens.length} lançamento(s) de ${mes}.`);
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : 'Falha ao exportar CSV.');
    } finally { setOcupado(false); }
  }

  async function autenticar(modo: 'cadastro' | 'login') {
    setMensagem('');
    if (!email.trim() || !senha) { setMensagem('Preencha e-mail e senha.'); return; }
    setOcupado(true);
    try {
      const credenciais = { email: email.trim(), password: senha };
      const { data: resultado, error } = modo === 'cadastro'
        ? await supabase.auth.signUp(credenciais)
        : await supabase.auth.signInWithPassword(credenciais);
      if (error) setMensagem(error.message);
      else if (modo === 'cadastro' && !resultado.session)
        setMensagem('Cadastro recebido. Confirme o e-mail e depois faça login.');
      else setMensagem(modo === 'cadastro' ? 'Cadastro concluído.' : 'Login concluído.');
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : 'Falha inesperada.');
    } finally { setOcupado(false); }
  }

  function cancelarEdicao() {
    setEditandoId(null); setEditandoImportado(false); setDescricao(''); setValor('');
    setData(hojeLocal()); setCategoriaId(''); setMensagem('');
  }
  function iniciarEdicao(item: Lancamento) {
    setEditandoId(item.id); setEditandoImportado(item.source === 'open_finance'); setTipo(item.type); setCategoriaId(item.category_id);
    setDescricao(item.description); setValor(String(item.amount).replace('.', ','));
    setData(item.date); setMensagem(`Editando: ${item.description}`);
  }
  async function atualizarLista(id: string) {
    const { data: lista, error } = await supabase.from('transactions')
      .select('id, description, amount, date, type, category_id, source, account_name')
      .eq('user_id', id).order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Operação feita, mas falhou a atualização da lista: ${error.message}`);
    setLancamentos((lista ?? []) as Lancamento[]);
  }
  async function salvarLancamento() {
    setMensagem('');
    if (!usuarioId) { setMensagem('Entre na sua conta antes de salvar.'); return; }
    const texto = descricao.trim();
    const valorTexto = valor.trim();
    const centavos = valorEmCentavos(valorTexto);
    const numero = (centavos ?? 0) / 100;
    if (texto.length < 2 || texto.length > 80) {
      setMensagem('A descrição deve ter entre 2 e 80 caracteres.'); return;
    }
    if (centavos === null) {
      setMensagem('Informe um valor positivo com até duas casas decimais.'); return;
    }
    if (!dataValida(data)) { setMensagem('Informe uma data válida AAAA-MM-DD.'); return; }
    if (!categoriaSelecionada) { setMensagem('Selecione uma categoria do tipo escolhido.'); return; }
    setOcupado(true);
    try {
      const campos = { category_id: categoriaSelecionada, type: tipo,
        description: texto, amount: numero, date: data };
      const camposEdicao = editandoImportado
        ? { category_id: categoriaSelecionada }
        : campos;
      const resultado = editandoId
        ? await supabase.from('transactions').update(camposEdicao)
            .eq('id', editandoId).eq('user_id', usuarioId).select('id')
        : await supabase.from('transactions').insert({ ...campos, user_id: usuarioId }).select('id');
      if (resultado.error) { setMensagem(resultado.error.message); return; }
      if (resultado.data?.length !== 1) {
        setMensagem('Nenhuma linha foi alterada. Atualize e confira o registro.'); return;
      }
      const foiEdicao = Boolean(editandoId);
      await atualizarLista(usuarioId);
      cancelarEdicao();
      setMensagem(foiEdicao ? 'Lançamento editado.' : 'Lançamento salvo.');
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : 'Falha inesperada.');
    } finally { setOcupado(false); }
  }
  async function excluirLancamento(id: string) {
    if (!usuarioId || ocupado) return;
    setOcupado(true); setMensagem('');
    try {
      const { data: excluidos, error } = await supabase.from('transactions')
        .delete().eq('id', id).eq('user_id', usuarioId).select('id');
      if (error) { setMensagem(`Erro ao excluir: ${error.message}`); return; }
      if (excluidos?.length !== 1) {
        setMensagem('Nenhum lançamento foi excluído. Atualize e confira o registro.'); return;
      }
      setLancamentos((anteriores) => anteriores.filter((item) => item.id !== id));
      if (editandoId === id) cancelarEdicao();
      setMensagem('Lançamento excluído.');
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : 'Falha inesperada.');
    } finally { setOcupado(false); }
  }
  function confirmarExclusao(item: Lancamento) {
    const executar = () => void excluirLancamento(item.id);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Excluir "${item.description}"?`)) executar();
      return;
    }
    Alert.alert('Excluir lançamento?', item.description, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: executar },
    ]);
  }
  async function sair() {
    setOcupado(true);
    try {
      const { error } = await supabase.auth.signOut();
      setMensagem(error ? error.message : 'Sessão encerrada.');
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : 'Falha ao sair.');
    } finally { setOcupado(false); }
  }

  if (iniciando) {
    return (
      <View style={[styles.page, styles.loadingContainer]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <StatusBar style="light" />

      {/* Brand Header */}
      <View style={styles.brand}>
        <View style={styles.brandTopRow}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>FINANÇAS PESSOAIS</Text>
          </View>
          <View style={styles.brandBadgeAlt}>
            <Text style={styles.brandBadgeAltText}>OPEN FINANCE</Text>
          </View>
        </View>
        <Text style={styles.titulo}>FinTrack</Text>
        <Text style={styles.tagline}>Controle inteligente, dados unificados e clareza financeira.</Text>
      </View>

      {session ? (
        <>
          {/* Sessão e Status do Usuário */}
          <View style={styles.userCard}>
            <View style={styles.userInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(session.user.email ?? 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userEmail}>{session.user.email}</Text>
                <Text style={styles.userStatus}>
                  ● Conectado · {categorias.length} categorias disponíveis
                </Text>
              </View>
            </View>
            <Button title="Sair" onPress={() => void sair()} disabled={ocupado} />
          </View>

          {/* Módulo Open Finance */}
          <BancosTeste />

          {/* Painel Mensal */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.subtitulo}>Painel mensal</Text>
              <View style={styles.periodoWrap}>
                <Text style={styles.rotuloInline}>Mês:</Text>
                <TextInput
                  placeholderTextColor={colors.muted}
                  style={styles.campoMes}
                  placeholder="AAAA-MM"
                  value={mes}
                  onChangeText={setMes}
                  maxLength={7}
                />
              </View>
            </View>

            {!mesValido ? (
              <View style={styles.avisoBox}>
                <Text style={styles.avisoTexto}>Informe um mês válido no formato AAAA-MM.</Text>
              </View>
            ) : (
              <View style={styles.summaryGrid}>
                <View style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <Text style={styles.metricLabel}>Receitas</Text>
                    <View style={[styles.statusDot, { backgroundColor: colors.income }]} />
                  </View>
                  <Text style={[styles.metricValue, { color: colors.income }]}>{moeda(receitas)}</Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <Text style={styles.metricLabel}>Despesas</Text>
                    <View style={[styles.statusDot, { backgroundColor: colors.expense }]} />
                  </View>
                  <Text style={[styles.metricValue, { color: colors.expense }]}>{moeda(despesas)}</Text>
                </View>

                <View style={[styles.metricCard, styles.metricCardHighlight]}>
                  <View style={styles.metricHeader}>
                    <Text style={styles.metricLabel}>Saldo do mês</Text>
                    <Text style={styles.metricBadge}>Líquido</Text>
                  </View>
                  <Text style={[styles.metricValue, { color: receitas - despesas >= 0 ? colors.income : colors.expense }]}>
                    {moeda(receitas - despesas)}
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.metricHeader}>
                    <Text style={styles.metricLabel}>Total Lançamentos</Text>
                    <Text style={styles.metricBadge}>{mes}</Text>
                  </View>
                  <Text style={styles.metricValue}>{doMes.length}</Text>
                </View>
              </View>
            )}

            {mesValido && (
              <View style={styles.graficoSection}>
                <Text style={styles.graficoTitulo}>Despesas por categoria</Text>
                {despesas > 0 ? (
                  <View style={styles.graficoContainer}>
                    <View style={styles.svgWrapper}>
                      <Svg width={180} height={180} viewBox="0 0 180 180" accessibilityLabel="Gráfico de despesas por categoria">
                        <Circle cx={90} cy={90} r={65} stroke={colors.borderSubtle} strokeWidth={24} fill="none" />
                        {fatias.map((f) => (
                          <Circle
                            key={f.id}
                            cx={90}
                            cy={90}
                            r={65}
                            fill="none"
                            stroke={f.cor}
                            strokeWidth={24}
                            strokeDasharray={`${f.proporcao * 408.407} 408.407`}
                            strokeDashoffset={-f.inicio * 408.407}
                          />
                        ))}
                      </Svg>
                    </View>
                    <View style={styles.legendasGrid}>
                      {fatias.map((f) => (
                        <View key={f.id} style={styles.legendaItem}>
                          <View style={[styles.legendaDot, { backgroundColor: f.cor }]} />
                          <View style={styles.legendaTextos}>
                            <Text style={styles.legendaNome}>{f.nome}</Text>
                            <Text style={[styles.legendaValor, { color: f.cor }]}>
                              {moeda(f.valor)} ({Math.round(f.proporcao * 100)}%)
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.vazioTexto}>Sem despesas registradas neste mês.</Text>
                )}
                <View style={{ marginTop: 14 }}>
                  <Button title="Exportar CSV do mês" onPress={() => void exportarCsv()} disabled={ocupado} />
                </View>
              </View>
            )}
          </View>

          {/* Formulário de Criação / Edição */}
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitulo}>
                {editandoImportado ? 'Alterar categoria do importado' : editandoId ? 'Editar lançamento' : 'Novo lançamento'}
              </Text>
              {editandoImportado && (
                <View style={styles.badgeSomenteLeitura}>
                  <Text style={styles.badgeSomenteLeituraTexto}>SOMENTE LEITURA</Text>
                </View>
              )}
            </View>

            <View style={styles.tipoSelector}>
              <View style={styles.tipoBotaoWrap}>
                <Button
                  title={tipo === 'expense' ? '● Despesa' : 'Despesa'}
                  onPress={() => { setTipo('expense'); setCategoriaId(''); }}
                  disabled={ocupado || editandoImportado}
                />
              </View>
              <View style={styles.tipoBotaoWrap}>
                <Button
                  title={tipo === 'income' ? '● Receita' : 'Receita'}
                  onPress={() => { setTipo('income'); setCategoriaId(''); }}
                  disabled={ocupado || editandoImportado}
                />
              </View>
            </View>

            <Text style={styles.rotulo}>Descrição</Text>
            <TextInput
              placeholderTextColor={colors.muted}
              style={[styles.campo, editandoImportado && styles.campoBloqueado]}
              placeholder="Descrição do lançamento"
              value={descricao}
              onChangeText={setDescricao}
              maxLength={80}
              editable={!editandoImportado}
            />

            <View style={styles.camposDuplos}>
              <View style={styles.campoMetade}>
                <Text style={styles.rotulo}>Valor (R$)</Text>
                <TextInput
                  placeholderTextColor={colors.muted}
                  style={[styles.campo, editandoImportado && styles.campoBloqueado]}
                  placeholder="Ex: 25,90"
                  keyboardType="decimal-pad"
                  value={valor}
                  onChangeText={setValor}
                  editable={!editandoImportado}
                />
              </View>
              <View style={styles.campoMetade}>
                <Text style={styles.rotulo}>Data (AAAA-MM-DD)</Text>
                <TextInput
                  placeholderTextColor={colors.muted}
                  style={[styles.campo, editandoImportado && styles.campoBloqueado]}
                  placeholder="AAAA-MM-DD"
                  value={data}
                  onChangeText={setData}
                  editable={!editandoImportado}
                />
              </View>
            </View>

            <Text style={styles.rotulo}>Categoria:</Text>
            <View style={styles.categorias}>
              {categoriasDoTipo.map((item) => (
                <View key={item.id} style={styles.botaoCategoria}>
                  <Button
                    title={`${categoriaSelecionada === item.id ? '✓ ' : ''}${item.name}`}
                    onPress={() => setCategoriaId(item.id)}
                    disabled={ocupado}
                  />
                </View>
              ))}
            </View>

            <View style={styles.formAcoes}>
              <Button
                title={editandoImportado ? 'Salvar categoria' : editandoId ? 'Salvar alterações' : 'Salvar lançamento'}
                onPress={() => void salvarLancamento()}
                disabled={ocupado || categorias.length === 0}
              />
              {editandoId && (
                <Button title="Cancelar edição" onPress={cancelarEdicao} disabled={ocupado} />
              )}
            </View>
          </View>

          {/* Lista de Lançamentos */}
          <View style={styles.listaSection}>
            <Text style={styles.subtitulo}>Meus lançamentos no mês</Text>
            <Text style={styles.rotulo}>Buscar lançamentos</Text>
            <TextInput
              placeholderTextColor={colors.muted}
              style={styles.campo}
              placeholder="Buscar pela descrição..."
              value={busca}
              onChangeText={setBusca}
            />

            <View style={styles.filtrosRow}>
              <View style={styles.filtroBtnWrap}>
                <Button title={filtro === 'all' ? '● Todos' : 'Todos'} onPress={() => setFiltro('all')} />
              </View>
              <View style={styles.filtroBtnWrap}>
                <Button title={filtro === 'income' ? '● Receitas' : 'Receitas'} onPress={() => setFiltro('income')} />
              </View>
              <View style={styles.filtroBtnWrap}>
                <Button title={filtro === 'expense' ? '● Despesas' : 'Despesas'} onPress={() => setFiltro('expense')} />
              </View>
            </View>

            {exibidos.length === 0 && (
              <View style={styles.avisoBox}>
                <Text style={styles.avisoTexto}>Nenhum lançamento para este filtro e mês.</Text>
              </View>
            )}

            <LancamentosPorDia
              itens={exibidos}
              categorias={categorias}
              ocupado={ocupado}
              onEditar={iniciarEdicao}
              onExcluir={confirmarExclusao}
            />
          </View>
        </>
      ) : (
        /* Tela de Autenticação */
        <View style={styles.authCard}>
          <Text style={styles.authTitulo}>Acesse sua conta</Text>
          <Text style={styles.authSubtitulo}>
            Entre ou crie uma conta para sincronizar suas finanças pessoais e Open Finance.
          </Text>

          <Text style={styles.rotulo}>E-mail</Text>
          <TextInput
            placeholderTextColor={colors.muted}
            style={styles.campo}
            placeholder="seu.email@exemplo.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.rotulo}>Senha</Text>
          <TextInput
            placeholderTextColor={colors.muted}
            style={styles.campo}
            placeholder="Sua senha"
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />

          <View style={styles.authBotoes}>
            <Button title="Entrar" onPress={() => void autenticar('login')} disabled={ocupado} />
            <Button title="Criar conta" onPress={() => void autenticar('cadastro')} disabled={ocupado} />
          </View>
        </View>
      )}

      {!!mensagem && (
        <View style={styles.mensagemContainer}>
          <Text style={styles.mensagem}>{mensagem}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    padding: 20,
    paddingTop: 40,
    paddingBottom: 64,
    gap: 16,
  },
  brand: {
    paddingVertical: 22,
    paddingHorizontal: 22,
    gap: 8,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: 20,
  },
  brandTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
  },
  brandBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  brandBadgeAlt: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandBadgeAltText: {
    color: colors.inkSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  titulo: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    color: colors.inkSecondary,
    lineHeight: 20,
  },
  userCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 16,
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 16,
  },
  userDetails: {
    gap: 2,
  },
  userEmail: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 14,
  },
  userStatus: {
    color: colors.muted,
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
    gap: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  periodoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rotuloInline: {
    color: colors.inkSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  campoMes: {
    minWidth: 110,
    height: 40,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitulo: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  rotulo: {
    fontWeight: '600',
    fontSize: 13,
    color: colors.inkSecondary,
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 180,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  metricCardHighlight: {
    borderTopWidth: 3,
    borderTopColor: colors.primary,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    color: colors.inkSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricBadge: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  metricValue: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  graficoSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    gap: 14,
  },
  graficoTitulo: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  graficoContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 20,
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendasGrid: {
    flex: 1,
    minWidth: 220,
    gap: 10,
  },
  legendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendaTextos: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    gap: 8,
  },
  legendaNome: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  legendaValor: {
    fontSize: 13,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  formTitulo: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  badgeSomenteLeitura: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeSomenteLeituraTexto: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  tipoSelector: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 4,
  },
  tipoBotaoWrap: {
    flex: 1,
  },
  campo: {
    width: '100%',
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
  },
  campoBloqueado: {
    backgroundColor: colors.soft,
    opacity: 0.7,
  },
  camposDuplos: {
    flexDirection: 'row',
    gap: 12,
  },
  campoMetade: {
    flex: 1,
  },
  categorias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  botaoCategoria: {
    marginBottom: 2,
  },
  formAcoes: {
    gap: 10,
    marginTop: 10,
  },
  listaSection: {
    gap: 14,
    marginTop: 8,
  },
  filtrosRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 2,
  },
  filtroBtnWrap: {
    flex: 1,
  },
  authCard: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    padding: 24,
    gap: 14,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    marginTop: 20,
  },
  authTitulo: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  authSubtitulo: {
    fontSize: 13,
    color: colors.inkSecondary,
    lineHeight: 19,
    marginBottom: 4,
  },
  authBotoes: {
    gap: 10,
    marginTop: 12,
  },
  mensagemContainer: {
    marginTop: 8,
  },
  mensagem: {
    color: colors.ink,
    backgroundColor: colors.soft,
    borderRadius: 14,
    padding: 16,
    fontSize: 14,
    lineHeight: 22,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  avisoBox: {
    backgroundColor: colors.soft,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  avisoTexto: {
    color: colors.inkSecondary,
    fontSize: 13,
  },
  vazioCard: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  vazioTexto: {
    color: colors.muted,
    fontSize: 13,
  },
});

