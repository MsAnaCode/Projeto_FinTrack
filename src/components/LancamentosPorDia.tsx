import Button from './ActionButton';
import { colors } from '../theme';
import { StyleSheet, Text, View } from 'react-native';
import type { Categoria, Lancamento } from '../domain/finance';
import { agruparPorDia, formatarDia } from '../domain/grouping';

type Props = {
  itens: Lancamento[];
  categorias: Categoria[];
  ocupado: boolean;
  onEditar: (item: Lancamento) => void;
  onExcluir: (item: Lancamento) => void;
};

const moeda = (n: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(n);

export default function LancamentosPorDia({
  itens,
  categorias,
  ocupado,
  onEditar,
  onExcluir,
}: Props) {
  return (
    <View style={styles.lista}>
      {agruparPorDia(itens).map((grupo) => (
        <View key={grupo.data} style={styles.grupo}>
          <View style={styles.diaHeader}>
            <View style={styles.diaBadge}>
              <Text style={styles.diaTexto}>{formatarDia(grupo.data)}</Text>
            </View>
            <View style={styles.diaLinha} />
          </View>

          {grupo.lancamentos.map((item) => {
            const importado = item.source === 'open_finance';
            const categoria = categorias.find((c) => c.id === item.category_id)?.name
              ?? 'Categoria não encontrada';
            const isIncome = item.type === 'income';

            return (
              <View key={item.id} style={styles.cartao}>
                <View style={styles.topoCard}>
                  <View style={styles.infoPrincipal}>
                    <Text style={styles.descricao}>{item.description}</Text>
                    <View style={styles.tagsContainer}>
                      <View style={[styles.tag, isIncome ? styles.tagIncome : styles.tagExpense]}>
                        <Text style={[styles.tagTexto, { color: isIncome ? colors.income : colors.expense }]}>
                          {isIncome ? 'Receita' : 'Despesa'}
                        </Text>
                      </View>
                      <View style={styles.tagCategoria}>
                        <Text style={styles.tagCategoriaTexto}>{categoria}</Text>
                      </View>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.amount,
                      { color: isIncome ? colors.income : colors.expense },
                    ]}
                  >
                    {isIncome ? '+ ' : '− '}
                    {moeda(Number(item.amount))}
                  </Text>
                </View>

                {importado ? (
                  <View style={styles.origem}>
                    <View style={styles.origemBadge}>
                      <Text style={styles.origemBadgeTexto}>OPEN FINANCE</Text>
                    </View>
                    <Text style={styles.origemTexto}>
                      {item.account_name || 'Conta bancária'} · somente leitura
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.manual}>Lançamento manual</Text>
                )}

                <View style={styles.botoes}>
                  <Button
                    title={importado ? 'Alterar categoria' : 'Editar'}
                    onPress={() => onEditar(item)}
                    disabled={ocupado}
                  />

                  {!importado && (
                    <Button
                      title="Excluir"
                      onPress={() => onExcluir(item)}
                      disabled={ocupado}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { width: '100%', gap: 20 },
  grupo: { gap: 10 },
  diaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    marginBottom: 4,
  },
  diaBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  diaTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  diaLinha: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  cartao: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  topoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoPrincipal: {
    flex: 1,
    gap: 6,
  },
  descricao: {
    fontWeight: '700',
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagIncome: {
    backgroundColor: colors.incomeSoft,
  },
  tagExpense: {
    backgroundColor: colors.expenseSoft,
  },
  tagTexto: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagCategoria: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagCategoriaTexto: {
    fontSize: 11,
    color: colors.inkSecondary,
    fontWeight: '500',
  },
  amount: {
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: -0.5,
  },
  manual: {
    color: colors.muted,
    fontSize: 12,
  },
  origem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.soft,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  origemBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  origemBadgeTexto: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  origemTexto: {
    color: colors.inkSecondary,
    fontSize: 12,
  },
  botoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
});

