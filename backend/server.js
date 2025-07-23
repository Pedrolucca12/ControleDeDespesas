const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Schemas atualizados com validações
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 20
  },
  photoPath: { 
    type: String, 
    required: true 
  },
  browserToken: { 
    type: String, 
    required: true, 
    unique: true 
  },
  lastLogin: { 
    type: Date, 
    default: Date.now 
  },
  expenses: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Expense' 
  }],
  importantDates: [{ 
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    date: {
      type: Date,
      required: true
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 200
    },
    createdAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  history: [{
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    details: {
      type: String,
      trim: true,
      maxlength: 200
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    scope: { 
      type: String, 
      enum: ['user', 'family'], 
      default: 'user' 
    }
  }],
  families: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Family' 
  }]
}, {
  timestamps: true
});

const familySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 50
  },
  code: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true,
    length: 6
  },
  members: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  expenses: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Expense' 
  }],
  history: [{
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    details: {
      type: String,
      trim: true,
      maxlength: 200
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }
  }],
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }
}, {
  timestamps: true
});

const expenseSchema = new mongoose.Schema({
  description: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  type: { 
    type: String, 
    enum: ['despesa', 'receita'], 
    required: true 
  },
  dueDate: { 
    type: Date, 
    required: true 
  },
  paymentType: { 
    type: String, 
    required: true,
    enum: ['dinheiro', 'cartão', 'boleto', 'transferência', 'outro']
  },
  responsavel: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 50
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 200
  },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  family: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Family' 
  }
}, {
  timestamps: true
});

// Índices para melhor performance
userSchema.index({ username: 1 });
userSchema.index({ browserToken: 1 });
familySchema.index({ code: 1 });
expenseSchema.index({ user: 1 });
expenseSchema.index({ family: 1 });
expenseSchema.index({ dueDate: 1 });

const User = mongoose.model('User', userSchema);
const Family = mongoose.model('Family', familySchema);
const Expense = mongoose.model('Expense', expenseSchema);

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadFolder));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Rotas de Usuário
app.post('/api/users', upload.single('photo'), async (req, res, next) => {
  try {
    const { username, browserToken } = req.body;
    
    if (!username || !browserToken) {
      return res.status(400).json({ error: 'Nome de usuário e token do navegador são obrigatórios' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Foto obrigatória' });
    }

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
      expenses: [],
      importantDates: [],
      history: [],
      families: []
    });

    await user.save();
    
    // Remover campos sensíveis da resposta
    const userResponse = user.toObject();
    delete userResponse.browserToken;
    
    res.status(201).json({ message: 'Usuário criado!', user: userResponse });
  } catch (err) {
    next(err);
  }
});

app.get('/api/users/:username', async (req, res, next) => {
  try {
    const { browserToken } = req.query;
    
    if (!browserToken) {
      return res.status(400).json({ error: 'Token do navegador é obrigatório' });
    }

    const user = await User.findOne({ 
      username: req.params.username,
      browserToken
    }).select('-browserToken -__v');

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado ou acesso não autorizado' });
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

app.patch('/api/users/:id/last-login', async (req, res, next) => {
  try {
    const { browserToken } = req.body;
    
    if (!browserToken) {
      return res.status(400).json({ error: 'Token do navegador é obrigatório' });
    }

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
    next(err);
  }
});

// Rotas de Despesas
app.post('/api/expenses', async (req, res, next) => {
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
    if (!user) {
      return res.status(403).json({ error: 'Usuário não autorizado' });
    }

    // Verificar família se for despesa familiar
    if (familyId) {
      const family = await Family.findOne({ _id: familyId, members: userId });
      if (!family) {
        return res.status(403).json({ error: 'Acesso não autorizado a esta família' });
      }
    }

    const expense = new Expense({
      description,
      amount,
      type,
      dueDate: new Date(dueDate),
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
    next(err);
  }
});

app.get('/api/expenses/:userId', async (req, res, next) => {
  try {
    const { familyId, browserToken } = req.query;
    
    if (!browserToken) {
      return res.status(400).json({ error: 'Token do navegador é obrigatório' });
    }

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: req.params.userId, browserToken });
    if (!user) {
      return res.status(403).json({ error: 'Usuário não autorizado' });
    }

    let expenses;

    if (familyId) {
      // Verificar se o usuário é membro da família
      const family = await Family.findOne({ _id: familyId, members: req.params.userId });
      if (!family) {
        return res.status(403).json({ error: 'Acesso não autorizado a esta família' });
      }

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
    next(err);
  }
});

// Rotas de Datas Importantes
app.post('/api/dates', async (req, res, next) => {
  try {
    const { title, date, notes, userId, browserToken } = req.body;
    
    if (!title || !date || !userId || !browserToken) {
      return res.status(400).json({ error: 'Título, data, ID do usuário e token do navegador são obrigatórios' });
    }

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) {
      return res.status(403).json({ error: 'Usuário não autorizado' });
    }

    const newDate = {
      title,
      date: new Date(date),
      notes,
      createdAt: new Date()
    };

    await User.findByIdAndUpdate(userId, { $push: { importantDates: newDate } });
    res.status(201).json({ message: 'Data importante adicionada!', date: newDate });
  } catch (err) {
    next(err);
  }
});

// Rotas de Histórico
app.post('/api/history', async (req, res, next) => {
  try {
    const { action, details, scope, userId, familyId, browserToken } = req.body;
    
    if (!action || !userId || !browserToken) {
      return res.status(400).json({ error: 'Ação, ID do usuário e token do navegador são obrigatórios' });
    }

    // Verificar se o usuário existe e o token é válido
    const user = await User.findOne({ _id: userId, browserToken });
    if (!user) {
      return res.status(403).json({ error: 'Usuário não autorizado' });
    }

    const entry = {
      action,
      details,
      timestamp: new Date(),
      scope: scope || 'user'
    };

    if (scope === 'family' && familyId) {
      // Verificar se o usuário é membro da família
      const family = await Family.findOne({ _id: familyId, members: userId });
      if (!family) {
        return res.status(403).json({ error: 'Acesso não autorizado a esta família' });
      }

      entry.user = userId;
      await Family.findByIdAndUpdate(familyId, { $push: { history: entry } });
    } else {
      await User.findByIdAndUpdate(userId, { $push: { history: entry } });
    }

    res.status(201).json({ message: 'Entrada de histórico adicionada!', entry });
  } catch (err) {
    next(err);
  }
});

// Rota de Sincronização de Dados Offline
app.post('/api/sync-data', async (req, res, next) => {
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
      try {
        const existing = await Expense.findById(exp._id);
        if (!existing) {
          const newExp = await Expense.create({
            description: exp.description,
            amount: exp.amount,
            type: exp.type,
            dueDate: new Date(exp.dueDate),
            paymentType: exp.paymentType,
            responsavel: exp.responsavel,
            notes: exp.notes,
            user: userId,
            family: exp.family || null,
            createdAt: exp.createdAt ? new Date(exp.createdAt) : new Date()
          });
          results.expenses.push(newExp);
        }
      } catch (expError) {
        console.error('Erro ao sincronizar despesa:', expError);
      }
    }

    // Sincronizar datas importantes
    for (const date of importantDates) {
      try {
        const existingDate = user.importantDates.find(d => d._id?.toString() === date._id);
        if (!existingDate) {
          const newDate = {
            title: date.title,
            date: new Date(date.date),
            notes: date.notes,
            createdAt: date.createdAt ? new Date(date.createdAt) : new Date()
          };

          await User.findByIdAndUpdate(userId, {
            $push: { importantDates: newDate }
          });
          results.dates.push(newDate);
        }
      } catch (dateError) {
        console.error('Erro ao sincronizar data importante:', dateError);
      }
    }

    // Sincronizar histórico
    for (const hist of history) {
      try {
        if (hist.scope === 'family' && hist.familyId) {
          const family = await Family.findOne({ _id: hist.familyId, members: userId });
          if (family) {
            const existingHist = family.history.find(h => h._id?.toString() === hist._id);
            if (!existingHist) {
              const newHist = {
                action: hist.action,
                details: hist.details,
                timestamp: hist.timestamp ? new Date(hist.timestamp) : new Date(),
                user: userId
              };

              await Family.findByIdAndUpdate(hist.familyId, {
                $push: { history: newHist }
              });
              results.history.push(newHist);
            }
          }
        } else {
          const existingHist = user.history.find(h => h._id?.toString() === hist._id);
          if (!existingHist) {
            const newHist = {
              action: hist.action,
              details: hist.details,
              timestamp: hist.timestamp ? new Date(hist.timestamp) : new Date(),
              scope: hist.scope || 'user'
            };

            await User.findByIdAndUpdate(userId, {
              $push: { history: newHist }
            });
            results.history.push(newHist);
          }
        }
      } catch (histError) {
        console.error('Erro ao sincronizar histórico:', histError);
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Tratamento de rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Inicia servidor
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

// Encerramento adequado do servidor
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('Servidor encerrado');
    process.exit(0);
  });
});

// Keep Alive para Render.com
const https = require('https');
const URL_TO_PING = 'https://controlededespesas.onrender.com';

function pingSite() {
  https.get(URL_TO_PING, (res) => {
    console.log(`[PING] ${new Date().toISOString()} - Status: ${res.statusCode}`);
  }).on('error', (e) => {
    console.error(`[PING ERROR] ${e.message}`);
  });
}

// Ping a cada 5 minutos para manter o servidor ativo
setInterval(pingSite, 40 * 1000);
pingSite(); // Primeiro ping