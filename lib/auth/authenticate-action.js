import { sendError, ErrorCodes } from "../http/errors.js";

/**
 * Authenticates the request against configured API keys.
 * Supports both standard Authorization: Bearer <key> and X-API-Key headers.
 * 
 * @param {import("next").NextApiRequest} req 
 * @param {import("next").NextApiResponse} res 
 * @param {"read"|"import"} requiredLevel 
 * @returns {{ level: "read"|"import" }|null} Authenticated user session or null if failed.
 */
export function authenticateAction(req, res, requiredLevel = "read") {
  const authHeader = req.headers["authorization"] || "";
  const apiKeyHeader = req.headers["x-api-key"] || "";
  
  let key = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    key = authHeader.substring(7).trim();
  } else if (apiKeyHeader) {
    key = apiKeyHeader.trim();
  }

  // Fallback cascade to support previous configurations:
  // GPT_ACTION_API_KEY / GPT_IMPORT_API_KEY -> API_KEY -> throw if none
  const actionKey = process.env.GPT_ACTION_API_KEY || process.env.API_KEY;
  const importKey = process.env.GPT_IMPORT_API_KEY || actionKey;

  if (!actionKey) {
    console.error("Neither GPT_ACTION_API_KEY nor API_KEY is defined in environment.");
    sendError(res, 500, ErrorCodes.INTERNAL_ERROR, "Server authentication is not configured.");
    return null;
  }

  if (requiredLevel === "import") {
    if (!key || key !== importKey) {
      sendError(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized. Valid import credentials required.");
      return null;
    }
    return { level: "import" };
  }

  // "read" level allows either key
  if (!key || (key !== actionKey && key !== importKey)) {
    sendError(res, 401, ErrorCodes.UNAUTHORIZED, "Unauthorized. Valid credentials required.");
    return null;
  }

  return { level: key === importKey ? "import" : "read" };
}
