const http = require("http");

class OllamaProvider {
  constructor(options = {}) {
    this.name = "ollama";
    this.host = options.host || process.env.OLLAMA_HOST || "127.0.0.1";
    this.port = parseInt(options.port || process.env.OLLAMA_PORT || "11434", 10);
    this.model = options.model || process.env.OLLAMA_MODEL || "qwen3:8b";
  }

  generate(prompt) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.model,
        prompt,
        stream: true
      });

      const request = http.request(
        {
          hostname: this.host,
          port: this.port,
          path: "/api/generate",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
          }
        },
        response => {
          let buffer = "";
          let fullResponse = "";

          response.on("data", chunk => {
            buffer += chunk.toString();

            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const item = JSON.parse(line);

                if (item.response) {
                  fullResponse += item.response;
                }
              } catch {}
            }
          });

          response.on("end", () => {
            if (buffer.trim()) {
              try {
                const item = JSON.parse(buffer);

                if (item.response) {
                  fullResponse += item.response;
                }
              } catch {}
            }

            resolve(fullResponse);
          });

          response.on("error", reject);
        }
      );

      request.on("error", reject);
      request.write(data);
      request.end();
    });
  }
}

module.exports = {
  OllamaProvider
};
