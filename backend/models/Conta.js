const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Conta = sequelize.define('Conta', {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  valor: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  vencimento: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  responsavel: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  dataEntrada: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  historico: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
  }
});

module.exports = Conta;
