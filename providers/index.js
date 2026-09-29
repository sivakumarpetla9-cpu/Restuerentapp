try {
  require("dotenv").config();
} catch {}

const { OllamaProvider } = require("./ollama");

function getProvider(name = process.env.AI_PROVIDER || "ollama", options = {}) {
  const providerType = (name || "ollama").toLowerCase();

  switch (providerType) {
    case "ollama":
      return new OllamaProvider(options);

    default:
      throw new Error(
        `Unsupported AI provider: "${providerType}". Currently supported providers: "ollama".`
      );
  }
}

module.exports = {
  getProvider,
  OllamaProvider
};
