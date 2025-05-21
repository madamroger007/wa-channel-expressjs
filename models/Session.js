const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Session = sequelize.define('Session', {
  sessionId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  qrData: {
    type: DataTypes.TEXT('long'), // agar base64 panjang bisa ditampung
    allowNull: true,
  },
  isReady: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'sessions',
  timestamps: true,
});

module.exports = Session;
