import Button from './ActionButton';
import { colors } from '../theme';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import WidgetBanco from './WidgetBanco';
type Connection = { id: string; connector_name: string; pluggy_item_id: string; last_synced_at: string | null };
export default function BancosTeste() {
  const [token, setToken] = useState<string | null>(null);
  const [itemId, setItemId] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function loadConnections() {
    const { data, error } = await supabase.from('bank_connections')
      .select('id,connector_name,pluggy_item_id,last_synced_at').order('created_at');
    if (error) throw error;
    setConnections((data ?? []) as Connection[]);
  }
  useEffect(() => { void loadConnections().catch(() => setMessage('Não foi possível listar conexões.')); }, []);
  async function invoke(name: string, body: object) {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) throw new Error('Entre na sua conta.');
    const result = await supabase.functions.invoke(name, {
      body, headers: { Authorization: `Bearer ${session.session.access_token}` },
    });
    if (result.error instanceof FunctionsHttpError) {
      const detail = await result.error.context.json().catch(() => null);
      throw new Error(typeof detail?.error === 'string' ? detail.error : `HTTP ${result.error.context.status}`);
    }
    if (result.error) throw result.error;
    return result.data;
  }
  async function openWidget() {
    setBusy(true); setMessage('Preparando conexão de teste...');
    try {
      const data = await invoke('bank-connect-token', {});
      if (typeof data?.connect_token !== 'string') throw new Error('Resposta sem token.');
      setToken(data.connect_token); setMessage('Escolha somente Sandbox / Pluggy Bank.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao abrir conexão.'); }
    finally { setBusy(false); }
  }
  async function sync(id = itemId.trim()) {
    if (!id) { setMessage('Informe o Item ID criado pelo widget.'); return; }
    setBusy(true); setMessage('Sincronizando lançamentos de teste...');
    try {
      const data = await invoke('bank-sync', { item_id: id });
      await loadConnections();
      setItemId(id);
      setMessage(`Sincronização concluída: ${Number(data?.imported ?? 0)} novo(s), ${Number(data?.fetched ?? 0)} válido(s). Atualize a página para recarregar o painel.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha na sincronização.'); }
    finally { setBusy(false); }
  }
  async function disconnect(connection: Connection) {
    setBusy(true); setMessage('Revogando consentimento e removendo dados importados...');
    try {
      await invoke('bank-disconnect', { connection_id: connection.id });
      await loadConnections();
      setItemId('');
      setMessage('Banco desconectado. Atualize a página para recarregar o painel sem os dados importados.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao desconectar.'); }
    finally { setBusy(false); }
  }
  function confirmDisconnect(connection: Connection) {
    const run = () => void disconnect(connection);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Desconectar o banco e apagar todos os lançamentos importados?')) run();
      return;
    }
    Alert.alert('Desconectar banco?', 'O consentimento será revogado e todos os lançamentos importados serão apagados. Lançamentos manuais serão preservados.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: run },
    ]);
  }
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>Conexão Open Finance</Text>
          <View style={styles.sandboxBadge}>
            <Text style={styles.sandboxBadgeText}>SANDBOX</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Ambiente seguro de demonstração. Conexão somente leitura via Pluggy Bank.
        </Text>
      </View>

      {connections.map((c) => (
        <View key={c.id} style={styles.connection}>
          <View style={styles.connectionHeader}>
            <View>
              <Text style={styles.connectorName}>{c.connector_name}</Text>
              <Text style={styles.lastSync}>
                Última sincronização: {c.last_synced_at ? new Date(c.last_synced_at).toLocaleString('pt-BR') : 'nunca'}
              </Text>
            </View>
            <View style={styles.activePill}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>Ativo</Text>
            </View>
          </View>
          <View style={styles.actionsRow}>
            <Button title="Sincronizar novamente" disabled={busy} onPress={() => void sync(c.pluggy_item_id)} />
            <Button title="Desconectar e apagar importados" disabled={busy} onPress={() => confirmDisconnect(c)} />
          </View>
        </View>
      ))}

      {connections.length === 0 && (
        <View style={styles.emptyForm}>
          <Button
            title={busy ? 'Preparando...' : 'Conectar Pluggy Bank'}
            disabled={busy || !!token}
            onPress={() => void openWidget()}
          />
          <View style={styles.divisorRow}>
            <View style={styles.divisorLinha} />
            <Text style={styles.divisorTexto}>ou utilize um Item ID existente</Text>
            <View style={styles.divisorLinha} />
          </View>
          <TextInput
            placeholderTextColor={colors.muted}
            value={itemId}
            onChangeText={setItemId}
            autoCapitalize="none"
            placeholder="Cole aqui o Item ID criado"
            style={styles.input}
          />
          <Button title="Salvar conexão e sincronizar" disabled={busy} onPress={() => void sync()} />
        </View>
      )}

      {!!message && (
        <View style={styles.messageBox}>
          <Text selectable style={styles.messageText}>{message}</Text>
        </View>
      )}

      {token && (
        <WidgetBanco
          token={token}
          onSuccess={(id) => {
            setItemId(id);
            setToken(null);
            setMessage('Conexão autorizada com sucesso. Clique em "Salvar conexão e sincronizar".');
          }}
          onClose={() => setToken(null)}
          onError={(m) => {
            setToken(null);
            setMessage(m);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    marginTop: 6,
  },
  header: {
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sandboxBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
  },
  sandboxBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  subtitle: {
    color: colors.inkSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  connection: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  connectorName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  lastSync: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.incomeSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.income,
  },
  activeText: {
    color: colors.income,
    fontSize: 11,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyForm: {
    gap: 12,
  },
  divisorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  divisorLinha: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  divisorTexto: {
    color: colors.muted,
    fontSize: 12,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 14,
  },
  messageBox: {
    backgroundColor: colors.soft,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  messageText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19,
  },
});

