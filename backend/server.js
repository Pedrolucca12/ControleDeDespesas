// server.js COMPLETO e corrigido
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Pastas
const uploadFolder = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// MongoDB
const uri = "mongodb+srv://BancoDeDadosOWNER:BancoCONTROLEAdm165qwe@cluster0.chktvcs.mongodb.net/controledecontas?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
  .then(() => console.log("✅ Conectado ao MongoDB Atlas!"))
  .catch(err => {
    console.error("❌ Erro ao conectar:", err);
    process.exit(1);
  });

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 20 },
  photoPath: { type: String, required: true },
  browserToken: { type: String, required: true, unique: true },
  lastLogin: { type: Date, default: Date.now },
  expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
  importantDates: [{
    title: String,
    date: Date,
    notes: String,
    createdAt: { type: Date, default: Date.now }
  }],
  history: [{
    action: String,
    details: String,
    timestamp: { type: Date, default: Date.now },
    scope: { type: String, enum: ['user', 'family'], default: 'user' }
  }],
  settings: {
    weeklyReport: { type: Boolean, default: false },
    monthlyReport: { type: Boolean, default: false },
    darkTheme: { type: Boolean, default: true }
  }
}, { timestamps: true });

const expenseSchema = new mongoose.Schema({
  description: String,
  amount: Number,
  type: { type: String, enum: ['despesa', 'receita'] },
  dueDate: Date,
  paymentType: { type: String, enum: ['dinheiro', 'cartão', 'boleto', 'transferência', 'outro'] },
  responsavel: String,
  notes: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Expense = mongoose.model('Expense', expenseSchema);

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadFolder));
app.use(express.static(path.join(__dirname, 'frontend')));

// Rotas
app.post('/api/users', upload.single('photo'), async (req, res) => {
  try {
    const { username, browserToken } = req.body;
    if (!username || !browserToken || !req.file) return res.status(400).json({ error: 'Campos obrigatórios' });

    // Verifica se usuário já existe
    const userExists = await User.findOne({ username });
    if (userExists) return res.status(400).json({ error: 'Usuário já existe' });

    // Verifica se token já está em uso
    const tokenExists = await User.findOne({ browserToken });
    if (tokenExists) return res.status(400).json({ error: 'Dispositivo já possui uma conta' });

    const user = await new User({
      username,
      browserToken,
      photoPath: '/uploads/' + req.file.filename,
      settings: {
        weeklyReport: false,
        monthlyReport: false,
        darkTheme: true
      }
    }).save();

    const userData = user.toObject();
    delete userData.browserToken;
    res.status(201).json({ message: 'Usuário criado!', user: userData });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Nome de usuário já existe' });
    }
    res.status(500).json({ error: 'Erro interno ao criar usuário' });
  }
});

app.get('/api/users/:username', async (req, res) => {
  const { browserToken } = req.query;
  if (!browserToken) return res.status(400).json({ error: 'Token obrigatório' });

  const user = await User.findOne({ username: req.params.username, browserToken }).select('-browserToken -__v');
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado ou token inválido' });

  res.json(user);
});

app.patch('/api/users/:id/last-login', async (req, res) => {
  const { browserToken } = req.body;
  const updated = await User.findOneAndUpdate({ _id: req.params.id, browserToken }, { lastLogin: new Date() });
  if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });

  res.json({ success: true });
});

app.patch('/api/users/:id/settings', async (req, res) => {
  const { browserToken, settings } = req.body;
  const updated = await User.findOneAndUpdate(
    { _id: req.params.id, browserToken },
    { settings },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });

  res.json({ success: true, settings: updated.settings });
});

// Rotas de despesas - permitem descrições duplicadas
app.post('/api/expenses', async (req, res) => {
  const { description, amount, type, dueDate, paymentType, responsavel, notes, userId, browserToken } = req.body;
  if (!description || !amount || !type || !dueDate || !paymentType || !responsavel || !userId || !browserToken)
    return res.status(400).json({ error: 'Campos obrigatórios' });

  const user = await User.findOne({ _id: userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  try {
    const expense = await new Expense({
      description, amount, type, dueDate, paymentType, responsavel, notes, user: userId
    }).save();

    await User.findByIdAndUpdate(userId, {
      $push: {
        expenses: expense._id,
        history: { action: `${type === 'despesa' ? 'Despesa' : 'Receita'} adicionada`, details: `${description} - R$ ${amount}` }
      }
    });

    res.status(201).json({ message: 'Despesa adicionada!', expense });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar despesa' });
  }
});

app.get('/api/expenses/:userId', async (req, res) => {
  const { browserToken } = req.query;
  const user = await User.findOne({ _id: req.params.userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  const expenses = await Expense.find({ user: req.params.userId }).sort({ dueDate: 1 });
  res.json(expenses);
});

app.delete('/api/expenses/:id', async (req, res) => {
  const { userId, browserToken } = req.body;
  const user = await User.findOne({ _id: userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  const expense = await Expense.findOne({ _id: req.params.id, user: userId });
  if (!expense) return res.status(404).json({ error: 'Despesa não encontrada' });

  await Expense.findByIdAndDelete(req.params.id);
  await User.findByIdAndUpdate(userId, {
    $pull: { expenses: req.params.id },
    $push: { history: { action: `${expense.type === 'despesa' ? 'Despesa' : 'Receita'} removida`, details: `${expense.description} - R$ ${expense.amount}` } }
  });

  res.json({ success: true });
});

// Rotas para relatórios
app.get('/api/reports/weekly/:userId', async (req, res) => {
  const { browserToken } = req.query;
  const user = await User.findOne({ _id: req.params.userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  const today = new Date();
  const firstDayOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
  const lastDayOfWeek = new Date(today.setDate(today.getDate() + 6));

  const expenses = await Expense.find({
    user: req.params.userId,
    dueDate: { $gte: firstDayOfWeek, $lte: lastDayOfWeek }
  }).sort({ dueDate: 1 });

  // Agrupa por tipo e dia para o gráfico
  const groupedData = {};
  expenses.forEach(exp => {
    const day = new Date(exp.dueDate).toLocaleDateString('pt-BR', { weekday: 'short' });
    if (!groupedData[day]) groupedData[day] = { despesa: 0, receita: 0 };
    groupedData[day][exp.type] += exp.amount;
  });

  res.json({
    expenses,
    chartData: {
      labels: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
      despesaData: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => groupedData[day] ? groupedData[day].despesa : 0),
      receitaData: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => groupedData[day] ? groupedData[day].receita : 0)
    }
  });
});

app.get('/api/reports/monthly/:userId', async (req, res) => {
  const { browserToken } = req.query;
  const user = await User.findOne({ _id: req.params.userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const expenses = await Expense.find({
    user: req.params.userId,
    dueDate: { $gte: firstDayOfMonth, $lte: lastDayOfMonth }
  }).sort({ dueDate: 1 });

  // Agrupa por tipo de pagamento para o gráfico
  const paymentTypes = ['dinheiro', 'cartão', 'boleto', 'transferência', 'outro'];
  const groupedData = {};
  
  paymentTypes.forEach(type => {
    groupedData[type] = expenses
      .filter(exp => exp.paymentType === type)
      .reduce((sum, exp) => sum + exp.amount, 0);
  });

  res.json({
    expenses,
    chartData: {
      labels: paymentTypes.map(type => type.charAt(0).toUpperCase() + type.slice(1)),
      data: paymentTypes.map(type => groupedData[type])
    }
  });
});

// Datas importantes
app.post('/api/dates', async (req, res) => {
  const { title, date, notes, userId, browserToken } = req.body;
  const user = await User.findOne({ _id: userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  const newDate = { title, date, notes, createdAt: new Date() };
  await User.findByIdAndUpdate(userId, {
    $push: {
      importantDates: newDate,
      history: { action: 'Data importante adicionada', details: `${title} - ${new Date(date).toLocaleDateString()}` }
    }
  });

  res.status(201).json({ message: 'Data adicionada', date: newDate });
});

app.get('/api/dates', async (req, res) => {
  const { userId, browserToken } = req.query;
  const user = await User.findOne({ _id: userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  res.json(user.importantDates);
});

app.delete('/api/dates/:id', async (req, res) => {
  const { userId, browserToken } = req.body;
  const user = await User.findOne({ _id: userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  const dateToRemove = user.importantDates.find(d => d._id.toString() === req.params.id);
  if (!dateToRemove) return res.status(404).json({ error: 'Data não encontrada' });

await User.findByIdAndUpdate(userId, {
  $pull: { importantDates: { _id: req.params.id } },
  $push: {
    history: {
      action: 'Data importante removida',
      details: `${dateToRemove.title} - ${new Date(dateToRemove.date).toLocaleDateString()}`
    }
  }
});

// Histórico
app.post('/api/history', async (req, res) => {
  const { action, details, userId, browserToken } = req.body;
  const user = await User.findOne({ _id: userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  const entry = { action, details, timestamp: new Date() };
  await User.findByIdAndUpdate(userId, { $push: { history: entry } });

  res.status(201).json({ message: 'Histórico adicionado', entry });
});

app.get('/api/history', async (req, res) => {
  const { userId, browserToken } = req.query;
  const user = await User.findOne({ _id: userId, browserToken });
  if (!user) return res.status(403).json({ error: 'Não autorizado' });

  res.json(user.history);
});

// Rota raiz e fallback
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

// Ping preventivo
const URL_TO_PING = "https://controlededespesas.onrender.com";
function pingSite() {
  https.get(URL_TO_PING, (res) => {
    console.log("Ping enviado:", res.statusCode);
  }).on("error", (e) => {
    console.error("Erro no ping:", e);
  });
}
setInterval(pingSite, 40 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));})   