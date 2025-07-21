const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Configuração para armazenar fotos enviadas
const uploadFolder = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Conexão com MongoDB
const uri = "mongodb+srv://BancoDeDadosOWNER:BancoCONTROLEAdm165qwe@cluster0.chktvcs.mongodb.net/controledecontas?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(uri)
  .then(() => console.log("✅ Conectado ao MongoDB Atlas!"))
  .catch(err => console.error("❌ Erro ao conectar:", err));

// --- Schemas ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  photoPath: { type: String, required: true },
  lastLogin: { type: Date, default: Date.now },
  families: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Family' }],
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
  }]
});

const familySchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
  history: [{
    action: String,
    details: String,
    timestamp: { type: Date, default: Date.now },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['despesa', 'receita'], required: true },
  dueDate: { type: Date, required: true },
  paymentType: { type: String, required: true },
  notes: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  family: { type: mongoose.Schema.Types.ObjectId, ref: 'Family' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Family = mongoose.model('Family', familySchema);
const Expense = mongoose.model('Expense', expenseSchema);

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadFolder));
app.use(express.static(path.join(__dirname, 'public')));

// Rotas de Usuário
app.post('/api/users', upload.single('photo'), async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Nome de usuário obrigatório' });
    if (!req.file) return res.status(400).json({ error: 'Foto obrigatória' });

    const user = new User({
      username,
      photoPath: '/uploads/' + req.file.filename,
      lastLogin: new Date(),
      families: [],
      expenses: [],
      importantDates: [],
      history: []
    });

    await user.save();
    res.status(201).json({ message: 'Usuário criado!', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .populate('families')
      .populate('expenses')
      .populate('history.user');
      
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// Rotas de Família
app.post('/api/families', async (req, res) => {
  try {
    const { name, userId } = req.body;
    if (!name || !userId) return res.status(400).json({ error: 'Nome e ID do usuário obrigatórios' });

    // Gera código aleatório de 6 caracteres
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    
    const family = new Family({
      name,
      code,
      members: [userId],
      expenses: [],
      history: [],
      createdBy: userId
    });

    await family.save();

    // Adiciona família ao usuário
    await User.findByIdAndUpdate(userId, { $push: { families: family._id } });

    res.status(201).json({ message: 'Família criada!', family });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar família' });
  }
});

app.post('/api/families/join', async (req, res) => {
  try {
    const { code, userId } = req.body;
    if (!code || !userId) return res.status(400).json({ error: 'Código e ID do usuário obrigatórios' });

    const family = await Family.findOne({ code: code.toUpperCase() });
    if (!family) return res.status(404).json({ error: 'Família não encontrada' });

    // Verifica se usuário já é membro
    if (family.members.includes(userId)) {
      return res.status(400).json({ error: 'Usuário já é membro desta família' });
    }

    // Adiciona usuário à família
    family.members.push(userId);
    await family.save();

    // Adiciona família ao usuário
    await User.findByIdAndUpdate(userId, { $push: { families: family._id } });

    res.json({ message: 'Usuário adicionado à família!', family });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao entrar na família' });
  }
});

// Rotas de Despesas
app.post('/api/expenses', async (req, res) => {
  try {
    const { description, amount, type, dueDate, paymentType, notes, userId, familyId } = req.body;

    if (!description || !amount || !type || !dueDate || !paymentType || !userId) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const expense = new Expense({
      description,
      amount,
      type,
      dueDate,
      paymentType,
      notes,
      user: userId,
      family: familyId || null
    });

    await expense.save();

    // Atualiza usuário
    await User.findByIdAndUpdate(userId, { $push: { expenses: expense._id } });

    // Se for despesa familiar, atualiza família também
    if (familyId) {
      await Family.findByIdAndUpdate(familyId, { $push: { expenses: expense._id } });
    }

    res.status(201).json({ message: 'Despesa adicionada!', expense });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar despesa' });
  }
});

app.get('/api/expenses/:userId', async (req, res) => {
  try {
    const { familyId } = req.query;
    let expenses;

    if (familyId) {
      // Busca despesas da família
      expenses = await Expense.find({ family: familyId })
        .sort({ dueDate: 1 })
        .populate('user', 'username photoPath');
    } else {
      // Busca despesas pessoais do usuário
      expenses = await Expense.find({ user: req.params.userId, family: null })
        .sort({ dueDate: 1 });
    }

    res.json(expenses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar despesas' });
  }
});

// Rotas de Datas Importantes
app.post('/api/dates', async (req, res) => {
  try {
    const { title, date, notes, userId } = req.body;
    if (!title || !date || !userId) return res.status(400).json({ error: 'Título, data e ID do usuário obrigatórios' });

    const newDate = {
      title,
      date,
      notes,
      createdAt: new Date()
    };

    await User.findByIdAndUpdate(userId, { $push: { importantDates: newDate } });
    res.status(201).json({ message: 'Data importante adicionada!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar data' });
  }
});

// Rotas de Histórico
app.post('/api/history', async (req, res) => {
  try {
    const { action, details, scope, userId, familyId } = req.body;
    if (!action || !userId) return res.status(400).json({ error: 'Ação e ID do usuário obrigatórios' });

    const entry = {
      action,
      details,
      timestamp: new Date(),
      scope: scope || 'user',
      user: userId
    };

    if (scope === 'family' && familyId) {
      await Family.findByIdAndUpdate(familyId, { $push: { history: entry } });
    } else {
      await User.findByIdAndUpdate(userId, { $push: { history: entry } });
    }

    res.status(201).json({ message: 'Entrada de histórico adicionada!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar histórico' });
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});