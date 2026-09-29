/**
 * Communication Provider Registry & Resolver
 */

const { LocalSimulatorProvider } = require("./localSimulator");
const { BrevoEmailProvider } = require("./brevoEmail");

const providers = new Map();

// Register the default ₹0 local simulator
const localSimulator = new LocalSimulatorProvider();
providers.set("local", localSimulator);
providers.set("simulator", localSimulator);

// Register Brevo Transactional Email provider
const brevoEmail = new BrevoEmailProvider();
providers.set("brevo", brevoEmail);

function getProvider(name = process.env.COMMUNICATION_PROVIDER || "local") {
  const key = String(name || "local").toLowerCase().trim();
  const provider = providers.get(key);
  if (!provider) {
    throw new Error(`Communication provider "${name}" is not supported or not configured. Active default is "local".`);
  }
  return provider;
}

function registerProvider(name, provider) {
  if (!name || !provider) {
    throw new Error("Provider name and instance are required for registration.");
  }
  providers.set(String(name).toLowerCase().trim(), provider);
}

function listProviders() {
  const result = [];
  for (const [key, p] of providers.entries()) {
    result.push({
      id: key,
      name: p.name || key,
      capabilities: p.capabilities || []
    });
  }
  return result;
}

module.exports = {
  getProvider,
  registerProvider,
  listProviders,
  LocalSimulatorProvider,
  BrevoEmailProvider
};
