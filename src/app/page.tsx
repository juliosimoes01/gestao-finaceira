"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { calculate, dayKey, money, Operation, pct } from "@/lib/finance";

type Settings = { initialCapital: number; dailyLimitPct: number };
const defaultSettings: Settings = { initialCapital: 0, dailyLimitPct: 10 };

const WEEKDAYS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda-feira" },
  { value: 2, short: "Ter", label: "Terça-feira" },
  { value: 3, short: "Qua", label: "Quarta-feira" },
  { value: 4, short: "Qui", label: "Quinta-feira" },
  { value: 5, short: "Sex", label: "Sexta-feira" },
  { value: 6, short: "Sábado", label: "Sábado" },
];

function getDateKeyForWeekday(
  targetWeekday: number,
  reference = new Date()
): string {
  const date = new Date(reference);
  const diff = targetWeekday - date.getDay();
  date.setDate(date.getDate() + diff);
  return dayKey(date);
}

function buildMonthWeeks(monthStr: string) {
  const [yearStr, monthIdxStr] = monthStr.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthIdxStr) - 1;

  const firstOfMonth = new Date(year, monthIdx, 1, 12, 0, 0);
  const lastOfMonth = new Date(year, monthIdx + 1, 0, 12, 0, 0);

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const gridEnd = new Date(lastOfMonth);
  gridEnd.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

  const weeks: {
    date: Date;
    key: string;
    dayNum: number;
    weekdayShort: string;
    inMonth: boolean;
  }[][] = [];

  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(cursor);
      week.push({
        date: current,
        key: dayKey(current),
        dayNum: current.getDate(),
        weekdayShort: WEEKDAYS[current.getDay()].short,
        inMonth: current.getMonth() === monthIdx,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [authError, setAuthError] = useState("");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ops, setOps] = useState<Operation[]>([]);
  const [initial, setInitial] = useState("1000");
  const [limit, setLimit] = useState("10");
  const [weekday, setWeekday] = useState<number>(() => new Date().getDay());
  const [entry, setEntry] = useState("");
  const [result, setResult] = useState("");
  const [outcome, setOutcome] = useState<"profit" | "loss">("profit");
  const [note, setNote] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");
  const [selectedDay, setSelectedDay] = useState(dayKey());
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const unsubSettings = onSnapshot(
      doc(db, "users", user.uid, "config", "main"),
      (s) => {
        if (s.exists()) {
          const v = s.data() as Settings;
          setSettings(v);
          setInitial(String(v.initialCapital));
          setLimit(String(v.dailyLimitPct));
        }
      }
    );
    const q = query(
      collection(db, "users", user.uid, "operations"),
      orderBy("createdAt", "desc")
    );
    const unsubOps = onSnapshot(q, (s) =>
      setOps(s.docs.map((d) => ({ id: d.id, ...d.data() } as Operation)))
    );
    return () => {
      unsubSettings();
      unsubOps();
    };
  }, [user]);

  const stats = useMemo(
    () => calculate(settings.initialCapital, ops, settings.dailyLimitPct),
    [settings, ops]
  );

  const filtered = useMemo(() => {
    if (period === "month") {
      return ops.filter((o) => o.dateKey.slice(0, 7) === month);
    }
    if (period === "day") {
      return ops.filter((o) => o.dateKey === selectedDay);
    }
    const baseDate = new Date(selectedDay + "T12:00:00");
    const dayOfWeek = baseDate.getDay();
    const start = new Date(baseDate);
    start.setDate(baseDate.getDate() - dayOfWeek);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startKey = dayKey(start);
    const endKey = dayKey(end);
    return ops.filter((o) => o.dateKey >= startKey && o.dateKey <= endKey);
  }, [ops, period, month, selectedDay]);

  const opsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of ops) {
      map.set(o.dateKey, (map.get(o.dateKey) || 0) + 1);
    }
    return map;
  }, [ops]);

  const monthWeeks = useMemo(() => buildMonthWeeks(month), [month]);

  const monthlyNet = filtered.reduce((s, o) => s + o.result, 0);
  const chartData = WEEKDAYS.map((w, i) => {
    const values = ops.filter(
      (o) => new Date(o.dateKey + "T12:00:00").getDay() === i
    );
    return { day: w.short, result: values.reduce((s, o) => s + o.result, 0) };
  });
  const todayBase = stats.todayBase;

  async function saveSettings() {
    if (!user || !db) return;
    const cap = Number(initial);
    const lim = Number(limit);
    if (
      !Number.isFinite(cap) ||
      cap <= 0 ||
      !Number.isFinite(lim) ||
      lim <= 0 ||
      lim > 100
    ) {
      setMessage("Informe um capital positivo e um limite entre 0 e 100%.");
      return;
    }
    await setDoc(doc(db, "users", user.uid, "config", "main"), {
      initialCapital: cap,
      dailyLimitPct: lim,
      updatedAt: new Date().toISOString(),
    });
    setMessage("Configurações salvas.");
  }

  async function addOperation(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !db) return;
    const amount = Number(entry);
    const val = Number(result);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(val) ||
      val < 0
    ) {
      setMessage("Informe uma entrada positiva e um resultado válido.");
      return;
    }
    if (settings.initialCapital <= 0) {
      setMessage("Configure o capital inicial antes de registrar operações.");
      return;
    }
    setSaving(true);
    try {
      const targetDateKey = getDateKeyForWeekday(weekday);
      const now = new Date();
      const opDate = new Date(targetDateKey + "T12:00:00");
      opDate.setHours(
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds()
      );

      const opsCol = collection(db, "users", user.uid, "operations");
      const oldSnapshot = await getDocs(
        query(opsCol, where("dateKey", "!=", targetDateKey))
      );

      if (!oldSnapshot.empty) {
        const batch = writeBatch(db);
        oldSnapshot.docs.forEach((oldDoc) => batch.delete(oldDoc.ref));
        await batch.commit();
      }

      await addDoc(opsCol, {
        amount,
        result: outcome === "profit" ? val : -val,
        note: note.trim(),
        createdAt: opDate.toISOString(),
        dateKey: targetDateKey,
      });

      setSelectedDay(targetDateKey);
      setMonth(targetDateKey.slice(0, 7));
      setEntry("");
      setResult("");
      setNote("");
      setMessage("Operação registrada (mantido apenas o último dia operado).");
    } catch {
      setMessage(
        "Não foi possível salvar. Verifique sua conexão e as regras do Firebase."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteOperation(id: string) {
    if (!user || !db || deletingId) return;
    setDeletingId(id);
    setMessage("");
    try {
      await deleteDoc(doc(db, "users", user.uid, "operations", id));
      setMessage("Operação excluída.");
    } catch {
      setMessage(
        "Não foi possível excluir. Verifique sua conexão e as regras do Firebase."
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setAuthError("");
    try {
      if (register) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Falha na autenticação."
      );
    }
  }

  if (!firebaseConfigured) {
    return (
      <main className="setup">
        <div className="setupCard">
          <div className="logo">
            <Wallet />
          </div>
          <h1>Gestão de Banca</h1>
          <p>
            Seu painel de controle financeiro está pronto para conectar ao
            Firebase.
          </p>
          <div className="notice">
            <AlertTriangle size={18} /> Configure as variáveis do Firebase no
            arquivo <code>.env.local</code> seguindo o <code>.env.example</code>{" "}
            e as instruções do README.
          </div>
          <ol>
            <li>Crie um projeto no Firebase Console.</li>
            <li>Ative Authentication com e-mail/senha.</li>
            <li>Crie o Firestore Database.</li>
            <li>
              Copie as credenciais do app Web para <code>.env.local</code>.
            </li>
          </ol>
        </div>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="setup">
        <p>Carregando...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="setup">
        <form className="loginCard" onSubmit={login}>
          <div className="logo">
            <Wallet />
          </div>
          <h1>Gestão de Banca</h1>
          <p>Acesse seu controle de operações</p>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {authError && <div className="error">{authError}</div>}
          <button className="primary full">
            {register ? "Criar conta" : "Entrar"}
          </button>
          <button
            type="button"
            className="textButton"
            onClick={() => setRegister(!register)}
          >
            {register ? "Já tenho conta" : "Criar uma conta"}
          </button>
        </form>
      </main>
    );
  }

  const periodLabel =
    period === "day"
      ? "Operações no dia"
      : period === "week"
      ? "Operações na semana"
      : "Operações no mês";

  const [yNum, mNum] = month.split("-").map(Number);
  const monthTitle = new Date(yNum, mNum - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <div className="brandIcon">
            <Wallet size={20} />
          </div>
          <div>
            <strong>Gestão de Banca</strong>
            <small>CONTROLE FINANCEIRO</small>
          </div>
        </div>
        <div className="userArea">
          <span>{user.email}</span>
          <button
            className="iconButton"
            onClick={() => auth && signOut(auth)}
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="welcome">
        <div>
          <p className="eyebrow">VISÃO GERAL</p>
          <h1>Seu desempenho, sob controle.</h1>
          <p>Acompanhe seu capital, limite percentual diário e resultados.</p>
        </div>
        <div className="dateTag">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
      </section>

      <section className="metrics">
        <Metric
          title="Capital atual"
          value={money(stats.current)}
          icon={<Wallet />}
          tone="blue"
          hint="Capital inicial + resultados"
        />
        <Metric
          title="Lucro líquido acumulado"
          value={money(stats.net)}
          icon={stats.net >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
          tone={stats.net >= 0 ? "green" : "red"}
          hint="Capital atual − capital inicial"
        />
        <Metric
          title="Investido hoje"
          value={money(stats.todayInvested)}
          icon={<CircleDollarSign />}
          tone="violet"
          hint={`${pct(stats.investedPct)} movimentado no dia`}
        />
        <Metric
          title="Limite % diário"
          value={`${pct(stats.usedLimitPct)} / ${pct(settings.dailyLimitPct)}`}
          icon={<ShieldCheck />}
          tone={stats.exceeded ? "red" : "green"}
          hint={
            stats.exceeded
              ? "Limite diário ultrapassado"
              : stats.todayNet > 0
              ? `Saldo positivo hoje (+${pct(stats.todayNetPct)})`
              : "Dentro do limite"
          }
        />
      </section>

      {stats.exceeded && (
        <div className="warning">
          <AlertTriangle />
          <div>
            <strong>Atenção: limite % diário ultrapassado!</strong>
            <span>
              Sua perda líquida hoje está em {pct(stats.usedLimitPct)} do
              capital inicial do dia ({money(stats.todayNetLoss)}), acima do
              limite de {pct(settings.dailyLimitPct)}.
            </span>
          </div>
        </div>
      )}

      <section className="mainGrid">
        <div className="panel">
          <div className="panelHeading">
            <div>
              <h2>Registrar operação</h2>
              <p>Informe o valor de entrada e o resultado financeiro líquido.</p>
            </div>
            <span className="roundIcon">
              <Plus />
            </span>
          </div>
          <form onSubmit={addOperation} className="operationForm">
            <label>
              Dia da semana para operar
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor da entrada (R$)
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Ex.: 50,00"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                required
              />
            </label>
            <label>
              Resultado da operação (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 35,00"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                required
              />
              <small>
                Digite somente o valor do lucro ou prejuízo, sem sinal negativo.
              </small>
            </label>
            <div className="outcomeChoice">
              <button
                type="button"
                className={outcome === "profit" ? "chosen positive" : ""}
                onClick={() => setOutcome("profit")}
              >
                <ArrowUpRight size={17} /> Lucro
              </button>
              <button
                type="button"
                className={outcome === "loss" ? "chosen negative" : ""}
                onClick={() => setOutcome("loss")}
              >
                <ArrowDownRight size={17} /> Prejuízo
              </button>
            </div>
            <label>
              Observação (opcional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: EUR/USD, estratégia..."
              />
            </label>
            <button className="primary full" disabled={saving}>
              <Plus size={17} />
              {saving ? "Salvando..." : "Registrar operação"}
            </button>
            {message && <p className="message">{message}</p>}
          </form>
        </div>

        <div className="panel">
          <div className="panelHeading">
            <div>
              <h2>Limite % diário</h2>
              <p>
                Acompanhe o saldo líquido diário de perdas e ganhos frente ao
                limite configurado.
              </p>
            </div>
            <span className="roundIcon">
              <ShieldCheck />
            </span>
          </div>
          <div className="limitDisplay">
            <strong>{pct(stats.usedLimitPct)}</strong>
            <span>consumido do limite de {pct(settings.dailyLimitPct)}</span>
          </div>
          <div className="progress">
            <div
              style={{
                width: `${Math.min(
                  (stats.usedLimitPct / settings.dailyLimitPct) * 100,
                  100
                )}%`,
              }}
              className={stats.exceeded ? "over" : ""}
            />
          </div>
          <p className="limitCaption">
            Saldo líquido hoje:{" "}
            <b className={stats.todayNet >= 0 ? "greenText" : "redText"}>
              {stats.todayNet >= 0 ? "+ " : "− "}
              {money(Math.abs(stats.todayNet))}
            </b>{" "}
            ({stats.todayNetPct >= 0 ? "+" : ""}
            {pct(stats.todayNetPct)}) sobre base de {money(todayBase)}.
          </p>
          <div className="settingsForm">
            <label>
              Capital inicial (R$)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={initial}
                onChange={(e) => setInitial(e.target.value)}
              />
            </label>
            <label>
              Limite % diário
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </label>
            <button className="secondary full" onClick={saveSettings}>
              Salvar configurações
            </button>
          </div>
        </div>
      </section>

      <section className="panel chartPanel">
        <div className="panelHeading">
          <div>
            <h2>Resultado por dia da semana</h2>
            <p>
              Lucro e prejuízo acumulados por dia da semana, considerando o
              histórico.
            </p>
          </div>
          <ChartNoAxesCombined className="headingIcon" />
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#263348"
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#91a0b5", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#91a0b5", fontSize: 11 }}
                tickFormatter={(v) => `R$${v}`}
              />
              <Tooltip
                formatter={(v) => money(Number(v))}
                contentStyle={{
                  background: "#111d30",
                  border: "1px solid #2b3b52",
                  borderRadius: 12,
                }}
              />
              <Bar
                dataKey="result"
                name="Resultado"
                fill="#6d8cff"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel historyPanel">
        <div className="panelHeading historyHeading">
          <div>
            <h2>Histórico de operações</h2>
            <p>Consulte seus resultados por dia, semana ou mês.</p>
          </div>
          <div className="filters">
            <select
              className="monthPicker"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as "day" | "week" | "month");
                setMonthMenuOpen(false);
              }}
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
            {period === "month" ? (
              <div className="monthPickerWrap">
                <button
                  type="button"
                  className="monthPicker monthTrigger"
                  onClick={() => setMonthMenuOpen((prev) => !prev)}
                >
                  <CalendarDays size={14} />
                  <span>{monthTitle}</span>
                </button>
                {monthMenuOpen && (
                  <div className="weekdayPopover">
                    <div className="popoverTop">
                      <strong>{monthTitle}</strong>
                      <div className="popoverActions">
                        <input
                          className="monthPicker"
                          type="month"
                          value={month}
                          onChange={(e) => {
                            if (e.target.value) setMonth(e.target.value);
                          }}
                        />
                        <button
                          type="button"
                          className="miniBtn"
                          onClick={() => {
                            setPeriod("month");
                            setMonthMenuOpen(false);
                          }}
                        >
                          Mês todo
                        </button>
                        <button
                          type="button"
                          className="miniBtn"
                          onClick={() => setMonthMenuOpen(false)}
                          aria-label="Fechar"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="weekdayHeader">
                      {WEEKDAYS.map((w) => (
                        <span key={w.value}>{w.short}</span>
                      ))}
                    </div>
                    <div className="weekRows">
                      {monthWeeks.map((week, idx) => (
                        <div key={idx} className="weekRow">
                          {week.map((d) => {
                            const isSelected = selectedDay === d.key;
                            const hasOps = (opsByDay.get(d.key) || 0) > 0;
                            return (
                              <button
                                key={d.key}
                                type="button"
                                className={`dayCell ${
                                  !d.inMonth ? "outside" : ""
                                } ${isSelected ? "active" : ""} ${
                                  hasOps ? "hasOps" : ""
                                }`}
                                onClick={() => {
                                  setSelectedDay(d.key);
                                  setMonth(d.key.slice(0, 7));
                                  setPeriod("day");
                                  setMonthMenuOpen(false);
                                }}
                              >
                                <span>{d.dayNum}</span>
                                <small>{d.weekdayShort}</small>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <input
                className="monthPicker"
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="monthSummary">
          <div>
            <small>{periodLabel}</small>
            <strong>{filtered.length}</strong>
          </div>
          <div>
            <small>Resultado do período</small>
            <strong className={monthlyNet >= 0 ? "greenText" : "redText"}>
              {money(monthlyNet)}
            </strong>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty">
            Nenhuma operação registrada neste período.
          </div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Entrada</th>
                  <th>Resultado</th>
                  <th>Observação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td>{new Date(o.createdAt).toLocaleString("pt-BR")}</td>
                    <td>{money(o.amount)}</td>
                    <td className={o.result >= 0 ? "greenText" : "redText"}>
                      {o.result >= 0 ? "+ " : "− "}
                      {money(Math.abs(o.result))}
                    </td>
                    <td>{o.note || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="iconButton"
                        onClick={() => deleteOperation(o.id)}
                        disabled={deletingId === o.id}
                        title="Excluir operação"
                        aria-label="Excluir operação"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer>
        Gestão de Banca <span>•</span> Dados sincronizados pelo Firebase
      </footer>
    </main>
  );
}

function Metric({
  title,
  value,
  icon,
  tone,
  hint,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
  hint: string;
}) {
  return (
    <div className="metric">
      <div className="metricTop">
        <span>{title}</span>
        <i className={tone}>{icon}</i>
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}