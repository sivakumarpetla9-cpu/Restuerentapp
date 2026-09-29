/**
 * Level 3 Communication Gateway - Main Entry Point
 */

const types = require("./types");
const lifecycle = require("./lifecycle");
const gateway = require("./gateway");
const providers = require("./providers");
const webhooks = require("./webhooks");
const eventsStore = require("../memory/communicationEventsStore");

module.exports = {
  ...types,
  ...lifecycle,
  ...gateway,
  ...providers,
  ...webhooks,
  eventsStore
};
