const mongoose = require('mongoose');

const uri = "mongodb+srv://BancoDeDadosOWNER:BancoCONTROLEAdm165qwe@cluster0.chktvcs.mongodb.net/controledecontas?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri)
  .then(() => {
    console.log("✅ Conectado ao MongoDB Atlas!");
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar ao MongoDB Atlas:", err);
  });
