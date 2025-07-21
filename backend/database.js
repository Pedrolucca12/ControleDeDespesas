const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './db.sqlite'  // arquivo do banco
});

module.exports = sequelize;
