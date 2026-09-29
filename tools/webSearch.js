/**
 * Web search tool - Standalone local version.
 * No external search APIs (Brave, Google, Serper, Serpex, OpenAI) are used.
 * Research operates via local research inputs:
 * 1. Direct URLs fetched via native Node.js HTTP/HTTPS fetch
 * 2. Saved local research files (.txt, .md, .json, .csv)
 * 3. Pasted research text
 */

const { fetchUrlContent } = require("./researchLoader");

async function fetchSource(url) {
  return await fetchUrlContent(url);
}

function webSearch() {
  return {
    mode: "LOCAL_RESEARCH_INPUT",
    message: "No paid search APIs configured. Research Agent operates locally using user-provided URLs, local files, or pasted notes."
  };
}

module.exports = {
  webSearch,
  fetchSource
};
