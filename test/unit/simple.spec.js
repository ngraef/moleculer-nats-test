'use strict';

const { ServiceBroker } = require('moleculer');
const _ = require('lodash');

const loiter = (ms) => new Promise((r) => setTimeout(r, ms));

let received = [];

const userService = {
  name: 'users',
  events: {
    'user.created'() {
      received.push(`${this.broker.nodeID}-${this.name}-uc`);
    },
  },
};

describe('Events for single service on multiple nodes', () => {
  const node1 = new ServiceBroker({
    nodeID: 'node1',
    transporter: 'nats://localhost:4222',
    disableBalancer: true,
    logger: false,
  });
  node1.createService(_.cloneDeep(userService));

  const node2 = new ServiceBroker({
    nodeID: 'node2',
    transporter: 'nats://localhost:4222',
    disableBalancer: true,
    logger: false,
  });
  node2.createService(_.cloneDeep(userService));

  beforeAll(() => Promise.all([node1.start(), node2.start()]));

  afterAll(() => Promise.all([node1.stop(), node2.stop()]));

  beforeEach(() => (received = []));

  it('should send emitted event to one node', async () => {
    node1.emit('user.created');
    await loiter(500);
    expect(received).toHaveLength(1);
    expect(received).toContainEqual(expect.stringMatching(/^node(1|2)-users-uc$/));
  });

  it('should send broadcasted event to all nodes', async () => {
    node1.broadcast('user.created');
    await loiter(500);
    // FAIL: only received by one node
    expect(received).toEqual(['node1-users-uc', 'node2-users-uc']);
  });
});
