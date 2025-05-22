// models/Session.js
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Session extends Model {}

Session.init({
  sessionId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  qrData: DataTypes.TEXT,
  isReady: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  sessionData: {
    type: DataTypes.JSON,  // simpan session WA dalam JSON
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'Session',
  tableName: 'sessions',
  timestamps: true,
});

module.exports = Session;
