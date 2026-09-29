const fs = require("fs");
const path = require("path");

function cleanHtml(html) {
  if (!html) return "";

  return html
    // Remove scripts, styles, svg, noscript, headers, footers, navs
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    // Convert common block elements to newlines
    .replace(/<\/(p|div|h[1-6]|li|tr|table|article|section)>/gi, "\n")
    .replace(/<br\s*[\/]?>/gi, "\n")
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Normalize whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

function readResearchFile(filePath) {
  try {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        source: filePath,
        sourceType: "FILE",
        error: `File not found: ${filePath}`
      };
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      return {
        success: false,
        source: filePath,
        sourceType: "FILE",
        error: `Path is not a regular file: ${filePath}`
      };
    }

    const content = fs.readFileSync(resolvedPath, "utf8");
    // Limit to reasonable size to prevent context overflow (max 8000 chars)
    const truncatedContent = content.length > 8000
      ? content.slice(0, 8000) + "\n\n[Content truncated at 8,000 characters for context limit]"
      : content;

    return {
      success: true,
      source: filePath,
      absolutePath: resolvedPath,
      sourceType: "FILE",
      content: truncatedContent.trim(),
      size: stat.size
    };
  } catch (err) {
    return {
      success: false,
      source: filePath,
      sourceType: "FILE",
      error: err.message
    };
  }
}

async function fetchUrlContent(rawUrl) {
  try {
    let targetUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      return {
        success: false,
        source: targetUrl,
        sourceType: "URL",
        error: "Invalid URL protocol: must start with http:// or https://"
      };
    }

    // Native Node fetch with 10s timeout
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Business-Agent/1.0",
        "Accept": "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return {
        success: false,
        source: targetUrl,
        sourceType: "URL",
        error: `HTTP error: ${response.status} ${response.statusText}`
      };
    }

    const rawText = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let extractedText = "";

    if (contentType.includes("application/json") || contentType.includes("text/plain")) {
      extractedText = rawText;
    } else {
      extractedText = cleanHtml(rawText);
    }

    // Limit to reasonable size for local Ollama context window
    const truncatedContent = extractedText.length > 8000
      ? extractedText.slice(0, 8000) + "\n\n[Content truncated at 8,000 characters for context limit]"
      : extractedText;

    return {
      success: true,
      source: targetUrl,
      sourceType: "URL",
      content: truncatedContent.trim(),
      status: response.status
    };
  } catch (err) {
    return {
      success: false,
      source: rawUrl,
      sourceType: "URL",
      error: err.message || "Failed to fetch URL"
    };
  }
}

async function parseResearchInputs(argv) {
  const filePaths = [];
  const urls = [];
  const pastedTexts = [];
  const remainingArgs = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--file" || arg === "-f") {
      if (i + 1 < argv.length) {
        filePaths.push(argv[++i]);
      }
    } else if (arg.startsWith("--file=")) {
      filePaths.push(arg.slice(7));
    } else if (arg === "--url" || arg === "-u") {
      if (i + 1 < argv.length) {
        urls.push(argv[++i]);
      }
    } else if (arg.startsWith("--url=")) {
      urls.push(arg.slice(6));
    } else if (arg === "--text" || arg === "-t" || arg === "--research") {
      if (i + 1 < argv.length) {
        pastedTexts.push(argv[++i]);
      }
    } else if (arg.startsWith("--text=")) {
      pastedTexts.push(arg.slice(7));
    } else {
      remainingArgs.push(arg);
    }
  }

  let rawMessage = remainingArgs.join(" ").trim();

  // If no explicit URLs given, check if rawMessage contains URLs
  const inlineUrlRegex = /https?:\/\/[^\s"'<>)]+/gi;
  const inlineUrls = rawMessage.match(inlineUrlRegex);
  if (inlineUrls && urls.length === 0) {
    for (const u of inlineUrls) {
      urls.push(u);
    }
  }

  // If no explicit files given, check if rawMessage mentions existing files (e.g. leads.csv)
  if (filePaths.length === 0) {
    const inlineFileRegex = /\b([\w\-./\\]+\.(?:csv|json|txt|md))\b/gi;
    const matchedFiles = rawMessage.match(inlineFileRegex);
    if (matchedFiles) {
      for (const candidate of matchedFiles) {
        const resolved = path.isAbsolute(candidate)
          ? candidate
          : path.resolve(process.cwd(), candidate);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          filePaths.push(candidate);
        }
      }
    }
  }


  // Load sources
  const sources = [];

  for (const fp of filePaths) {
    const fileResult = readResearchFile(fp);
    sources.push(fileResult);
  }

  for (const u of urls) {
    const urlResult = await fetchUrlContent(u);
    sources.push(urlResult);
  }

  for (const text of pastedTexts) {
    sources.push({
      success: true,
      source: "User Pasted Research Text",
      sourceType: "PASTED_TEXT",
      content: text.trim(),
      size: text.length
    });
  }

  return {
    message: rawMessage,
    sources
  };
}

module.exports = {
  readResearchFile,
  fetchUrlContent,
  parseResearchInputs,
  cleanHtml
};
