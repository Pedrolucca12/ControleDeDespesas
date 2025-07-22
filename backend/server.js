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
  families: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Family' }]
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
  responsavel: { type: String, required: true },
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
    const { username, browserToken } = req.body;
    if (!username || !browserToken) return res.status(400).json({ error: 'Nome de usuário e token do navegador são obrigatórios' });
    if (!req.file) return res.status(400).json({ error: 'Foto obrigatória' });

    // Verificar se username já existe
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Nome de usuário já existe' });
    }

    // Verificar se browserToken já está em uso
    const existingTokenUser = await User.findOne({ browserToken });
    if (existingTokenUser) {
      return res.status(400).json({ error: 'Dispositivo já possui uma conta' });
    }

    const user = new User({
      username,
      photoPath: '/uploads/' + req.file.filename,
      browserToken,
      lastLogin: new Date(),
      expenses: [],
      importantDates: [],
      history: [],
      families: []
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
    const { browserToken } = req.query;
    if (!browserToken) return res.status(400).json({ error: 'Token do navegador é obrigatório' });

    const user = await User.findOne({ 
      username: req.params.username,
      browserToken
    }).populate('expenses').populate('families');

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado ou acesso não autorizado' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

app.patch('/api/users/:id/last-login', async (req, res) => {
  try {
    const { browserToken } = req.body;
    if (!browserToken) return res.status(400).json({ error: 'Token do navegador é obrigatório' });
    
    const user = await User.findOneAndUpdate(
      { 
        _id: req.params.id,
        browserToken 
      },
      { lastLogin: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar último login' });
  }
});

// Rotas de Família
app.post('/api/families', async (req, res) => {
  try {
    const { name, userId, browserToken } = req.body;
    if (!name || !userId || !browserToken) return res.status(400).json({ error: 'Nome, ID do usuário e token do navegador são obrigatórios' });

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) return res.status(403).json({ error: 'Usuário não autorizado' });

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
    const { code, userId, browserToken } = req.body;
    if (!code || !userId || !browserToken) return res.status(400).json({ error: 'Código, ID do usuário e token do navegador são obrigatórios' });

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) return res.status(403).json({ error: 'Usuário não autorizado' });

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
    const { 
      description, 
      amount, 
      type, 
      dueDate, 
      paymentType, 
      responsavel,
      notes, 
      userId, 
      familyId,
      browserToken
    } = req.body;

    if (!description || !amount || !type || !dueDate || !paymentType || !responsavel || !userId || !browserToken) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) return res.status(403).json({ error: 'Usuário não autorizado' });

    const expense = new Expense({
      description,
      amount,
      type,
      dueDate,
      paymentType,
      responsavel,
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
    const { familyId, browserToken } = req.query;
    if (!browserToken) return res.status(400).json({ error: 'Token do navegador é obrigatório' });

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: req.params.userId, browserToken });
    if (!user) return res.status(403).json({ error: 'Usuário não autorizado' });

    let expenses;

    if (familyId) {
      // Verificar se o usuário é membro da família
      const family = await Family.findOne({ _id: familyId, members: req.params.userId });
      if (!family) return res.status(403).json({ error: 'Acesso não autorizado a esta família' });

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
    const { title, date, notes, userId, browserToken } = req.body;
    if (!title || !date || !userId || !browserToken) return res.status(400).json({ error: 'Título, data, ID do usuário e token do navegador são obrigatórios' });

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) return res.status(403).json({ error: 'Usuário não autorizado' });

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
    const { action, details, scope, userId, familyId, browserToken } = req.body;
    if (!action || !userId || !browserToken) return res.status(400).json({ error: 'Ação, ID do usuário e token do navegador são obrigatórios' });

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) return res.status(403).json({ error: 'Usuário não autorizado' });

    const entry = {
      action,
      details,
      timestamp: new Date(),
      scope: scope || 'user',
      user: userId
    };

    if (scope === 'family' && familyId) {
      // Verificar se o usuário é membro da família
      const family = await Family.findOne({ _id: familyId, members: userId });
      if (!family) return res.status(403).json({ error: 'Acesso não autorizado a esta família' });

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

// Rota de Sincronização de Dados Offline
app.post('/api/sync-data', async (req, res) => {
  try {
    const { 
      userId,
      browserToken,
      expenses = [],
      importantDates = [],
      history = []
    } = req.body;

    if (!userId || !browserToken) {
      return res.status(400).json({ error: 'ID do usuário e token do navegador são obrigatórios' });
    }

    // Verificar autenticação
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Sincronizar cada tipo de dado
    const results = {
      expenses: [],
      dates: [],
      history: []
    };

    // Sincronizar despesas
    for (const exp of expenses) {
      const existing = await Expense.findById(exp._id);
      if (!existing) {
        const newExp = await Expense.create({
          ...exp,
          user: userId,
          family: exp.family || null
        });
        results.expenses.push(newExp);
      }
    }

    // Sincronizar datas importantes
    for (const date of importantDates) {
      const existingDate = user.importantDates.find(d => d._id?.toString() === date._id);
      if (!existingDate) {
        await User.findByIdAndUpdate(userId, {
          $push: {
            importantDates: {
              title: date.title,
              date: date.date,
              notes: date.notes,
              createdAt: date.createdAt || new Date()
            }
          }
        });
        results.dates.push(date);
      }
    }

    // Sincronizar histórico
    for (const hist of history) {
      if (hist.scope === 'family' && hist.familyId) {
        const family = await Family.findOne({ _id: hist.familyId, members: userId });
        if (family) {
          const existingHist = family.history.find(h => h._id?.toString() === hist._id);
          if (!existingHist) {
            await Family.findByIdAndUpdate(hist.familyId, {
              $push: {
                history: {
                  action: hist.action,
                  details: hist.details,
                  timestamp: hist.timestamp || new Date(),
                  user: userId
                }
              }
            });
            results.history.push(hist);
          }
        }
      } else {
        const existingHist = user.history.find(h => h._id?.toString() === hist._id);
        if (!existingHist) {
          await User.findByIdAndUpdate(userId, {
            $push: {
              history: {
                action: hist.action,
                details: hist.details,
                timestamp: hist.timestamp || new Date(),
                scope: hist.scope || 'user'
              }
            }
          });
          results.history.push(hist);
        }
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao sincronizar dados' });
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

// --- Keep Awake (ping a cada 40 segundos) --- //
const https = require('https');
const URL_TO_PING = 'https://controlededespesas.onrender.com';

function pingSite() {
  https.get(URL_TO_PING, (res) => {
    console.log(`[PING] ${new Date().toISOString()} - Status: ${res.statusCode}`);
  }).on('error', (e) => {
    console.error(`[PING ERROR] ${e.message}`);
  });
}

setInterval(pingSite, 40 * 1000); // A cada 40 segundos
pingSite(); // Envia o primeiro ping logo ao iniciar