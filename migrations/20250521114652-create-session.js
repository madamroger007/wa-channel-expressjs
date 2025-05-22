'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sessions', {
      sessionId: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      qrData: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      isReady: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      sessionData: {
        type: Sequelize.JSON, // Tipe JSON untuk menyimpan session WA
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        // Untuk MySQL bisa pakai ON UPDATE CURRENT_TIMESTAMP,
        // tapi kalau tidak support, update manual lewat kode
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sessions');
  }
};
