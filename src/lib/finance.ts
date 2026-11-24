export type Operation = {
  id: string;
  amount: number;
  result: number;
  note?: string;
  createdAt: string;
  dateKey: string;
};

export function dayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

export function pct(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(2).replace(".", ",")}%`;
}

export function calculate(
  initialCapital: number,
  ops: Operation[],
  dailyLimitPct: number
) {
  const today = dayKey();
  const net = ops.reduce((sum, o) => sum + o.result, 0);
  const current = initialCapital + net;

  const todayOps = ops.filter((o) => o.dateKey === today);
  const todayInvested = todayOps.reduce((sum, o) => sum + o.amount, 0);
  const todayNet = todayOps.reduce((sum, o) => sum + o.result, 0);

  // Capital disponível no início do dia (antes das operações de hoje)
  const todayBase = Math.max(current - todayNet, 0);

  // Perda líquida do dia (ganhos abatem perdas; se saldo do dia >= 0, perda = 0)
  const todayNetLoss = todayNet < 0 ? Math.abs(todayNet) : 0;

  // % do limite diário efetivamente consumido após somar ganhos e deduzir perdas
  const usedLimitPct = todayBase > 0 ? (todayNetLoss / todayBase) * 100 : 0;

  // Variação percentual líquida do dia (+ lucro / - prejuízo)
  const todayNetPct = todayBase > 0 ? (todayNet / todayBase) * 100 : 0;

  // % total movimentado/investido no dia (mantido para o card "Investido hoje")
  const investedPct = todayBase > 0 ? (todayInvested / todayBase) * 100 : 0;

  const exceeded = dailyLimitPct > 0 && usedLimitPct > dailyLimitPct;

  return {
    current,
    net,
    todayInvested,
    todayBase,
    todayNet,
    todayNetLoss,
    todayNetPct,
    usedLimitPct,
    investedPct,
    exceeded,
  };
}