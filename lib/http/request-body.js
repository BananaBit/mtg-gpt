import { sendError, ErrorCodes } from "./errors.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FIELD_LENGTH = 2000;

/**
 * Validates request payload constraints.
 * @param {import("next").NextApiRequest} req 
 * @param {import("next").NextApiResponse} res 
 * @returns {boolean} True if valid, false if rejected.
 */
export function validateRequestBody(req, res) {
  // Check Content-Length if present
  const contentLength = req.headers["content-length"];
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    sendError(res, 413, ErrorCodes.REQUEST_TOO_LARGE, "Request body exceeds maximum size of 5 MB.");
    return false;
  }

  // Check actual body string size if it's already parsed/available
  if (req.body) {
    let bodyStr = "";
    if (typeof req.body === "string") {
      bodyStr = req.body;
    } else {
      bodyStr = JSON.stringify(req.body);
    }

    if (bodyStr.length > MAX_BODY_BYTES) {
      sendError(res, 413, ErrorCodes.REQUEST_TOO_LARGE, "Request body exceeds maximum size of 5 MB.");
      return false;
    }

    // Validate field lengths for top-level keys (except fields that can be large, like 'csv' or 'decklist')
    for (const [key, value] of Object.entries(req.body)) {
      if (key !== "csv" && key !== "decklist" && typeof value === "string") {
        if (value.length > MAX_FIELD_LENGTH) {
          sendError(
            res,
            400,
            ErrorCodes.INVALID_COLLECTION_EXPORT,
            `Field '${key}' exceeds maximum length of ${MAX_FIELD_LENGTH} characters.`
          );
          return false;
        }
      }
    }
  }

  return true;
}
