const http = require('node:http');
const { startAdminServer } = require('../../src/controllers/admin');

const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function listenForTest() {
  this.once('listening', () => process.send({ port: this.address().port }));
  return originalListen.call(this, 0, '127.0.0.1');
};

startAdminServer({
  getAccounts: () => ({
    accounts: [
      { id: 'alice-farm', username: 'alice', name: 'Alice Farm' },
      { id: 'bob-farm', username: 'bob', name: 'Bob Farm' },
    ],
    nextId: 3,
  }),
  getPetOverview: async accountId => ({ accountId }),
});
