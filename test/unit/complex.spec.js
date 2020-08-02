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
    '$internal.user.event'() {
      received.push(`${this.broker.nodeID}-${this.name}-$iue`);
    },
  },
};

const paymentService = {
  name: 'payment',
  events: {
    'user.created'() {
      received.push(`${this.broker.nodeID}-${this.name}-uc`);
    },
  },
};

const stripeService = {
  name: 'stripe',
  events: {
    'user.created': {
      group: 'payment',
      handler() {
        received.push(`${this.broker.nodeID}-${this.name}-uc`);
      },
    },
  },
};

const mailService = {
  name: 'mail',
  events: {
    'user.*'() {
      received.push(`${this.broker.nodeID}-${this.name}-u*`);
    },
  },
};

const otherService = {
  name: 'other',
  events: {
    'other.thing'() {
      received.push(`${this.broker.nodeID}-${this.name}-ot`);
    },
    'user.*'() {
      received.push(`${this.broker.nodeID}-${this.name}-u*`);
    },
  },
};

describe('Events for multiple services and groups on multiple nodes', () => {
  const node1 = new ServiceBroker({
    nodeID: 'node1',
    transporter: 'nats://localhost:4222',
    disableBalancer: true,
    logger: false,
  });
  node1.createService(_.cloneDeep(paymentService));
  node1.createService(_.cloneDeep(stripeService));
  node1.createService(_.cloneDeep(userService));

  const node2 = new ServiceBroker({
    nodeID: 'node2',
    transporter: 'nats://localhost:4222',
    disableBalancer: true,
    logger: false,
  });
  node2.createService(_.cloneDeep(paymentService));
  node2.createService(_.cloneDeep(stripeService));

  const node3 = new ServiceBroker({
    nodeID: 'node3',
    transporter: 'nats://localhost:4222',
    disableBalancer: true,
    logger: false,
  });
  node3.createService(_.cloneDeep(mailService));

  const node4 = new ServiceBroker({
    nodeID: 'node4',
    transporter: 'nats://localhost:4222',
    disableBalancer: true,
    logger: false,
  });
  node4.createService(_.cloneDeep(otherService));

  beforeAll(() => Promise.all([node1.start(), node2.start(), node3.start(), node4.start()]));

  afterAll(() => Promise.all([node1.stop(), node2.stop(), node3.stop(), node4.stop()]));

  beforeEach(() => (received = []));

  it("emit a 'user.created' event", async () => {
    node1.emit('user.created');
    await loiter(500);
    expect(received).toHaveLength(4);
    expect(received).toContainEqual(expect.stringMatching(/^node(1|2)-(payment|stripe)-uc$/));
    expect(received).toContainEqual('node1-users-uc');
    expect(received).toContainEqual('node3-mail-u*');
    expect(received).toContainEqual('node4-other-u*');
  });

  it("emit a 'user.created' event to filtered group", async () => {
    node1.emit('user.created', null, 'payment');
    await loiter(500);
    expect(received).toEqual([expect.stringMatching(/node(1|2)-(payment|stripe)-uc/)]);
  });

  it("broadcast a 'user.created' event to all nodes & services", async () => {
    node1.broadcast('user.created');
    await loiter(500);
    // FAIL: always delivered to node1-users, node3-mail and node4-other, but either node1-stripe & node1-payment or node2-stripe & node2-payment
    expect(received).toHaveLength(7);
    [
      'node1-payment-uc',
      'node1-stripe-uc',
      'node1-users-uc',
      'node2-payment-uc',
      'node2-stripe-uc',
      'node3-mail-u*',
      'node4-other-u*',
    ].forEach((item) => {
      expect(received).toContain(item);
    });
  });

  it("broadcast a 'user.created' event to filtered group", async () => {
    node1.broadcast('user.created', null, 'payment');
    await loiter(500);
    // FAIL: only received by node1 or node2, but delivered to both services on that node
    expect(received).toHaveLength(4);
    ['node1-payment-uc', 'node1-stripe-uc', 'node2-payment-uc', 'node2-stripe-uc'].forEach(
      (item) => {
        expect(received).toContain(item);
      }
    );
  });
});
