# Gestão de Banca — Web + Firebase

Aplicação web em Next.js para registrar entradas, resultados líquidos, acompanhar capital e controlar o limite diário de exposição. Interface em português e moeda BRL. Limite inicial: 10%.

## Regra financeira adotada
- **Capital atual** = capital inicial + soma dos resultados líquidos registrados.
- **Lucro líquido acumulado** = capital atual − capital inicial.
- Cada operação registra separadamente o **valor de entrada** (exposição) e o **resultado líquido** (lucro positivo ou prejuízo negativo).
- **Percentual investido no dia** = soma das entradas do dia ÷ capital disponível no início do dia × 100.
- O alerta aparece quando o percentual diário ultrapassa o limite configurado.

O valor da entrada não é subtraído do capital como perda: somente o resultado líquido altera o capital. Registre no campo resultado o lucro/prejuízo efetivo da operação, não o retorno bruto recebido.

## Requisitos
- Node.js 20+
- Projeto Firebase

## Configuração do Firebase
1. Crie um projeto em https://console.firebase.google.com/.
2. Em **Authentication → Sign-in method**, habilite **E-mail/senha**.
3. Em **Firestore Database**, crie o banco.
4. Em **Configurações do projeto → Seus apps**, registre um app Web e copie os valores de configuração.
5. Copie `.env.example` para `.env.local` e preencha as seis variáveis `NEXT_PUBLIC_FIREBASE_*`.
6. No Firebase Console → Firestore → Rules, publique o conteúdo de `firestore.rules`.

## Executar localmente
```bash
npm install
npm run dev
```
Abra http://localhost:3000. Crie sua conta pelo botão **Criar uma conta**. Configure capital inicial e limite diário no painel.

## Publicar
Publique em Vercel ou Firebase App Hosting. Cadastre as mesmas variáveis de ambiente usadas no `.env.local` no ambiente de produção e faça o deploy.

## Estrutura do Firestore
```text
users/{uid}/config/main
  initialCapital: number
  dailyLimitPct: number

users/{uid}/operations/{operationId}
  amount: number       // valor de entrada
  result: number       // lucro positivo ou prejuízo negativo
  note: string
  createdAt: ISO string
  dateKey: YYYY-MM-DD
```
As regras restringem cada usuário aos próprios documentos.

## Observações
- O dashboard atualiza em tempo real com `onSnapshot`.
- O gráfico agrupa o resultado histórico por dia da semana; o histórico tabular é filtrável por mês.
- Para obter relatórios semanais detalhados, edição/exclusão de operações e exportação CSV/PDF, essas funcionalidades podem ser adicionadas numa próxima etapa.
- O sistema é um controle de registros, não se conecta à corretora nem confirma operações automaticamente.
