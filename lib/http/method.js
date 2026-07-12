import { sendError, ErrorCodes } from "./errors.js";

/**
 * Enforces specific HTTP method(s) on a handler.
 * @param {import("next").NextApiRequest} req 
 * @param {import("next").NextApiResponse} res 
 * @param {string|string[]} allowedMethods 
 * @returns {boolean} True if the request method is allowed, false if rejected.
 */
export function enforceMethod(req, res, allowedMethods) {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];
  const reqMethod = req.method ? req.method.toUpperCase() : "";

  if (!methods.map(m => m.toUpperCase()).includes(reqMethod)) {
    res.setHeader("Allow", methods.join(", "));
    sendError(
      res,
      405,
      ErrorCodes.METHOD_NOT_ALLOWED,
      `Method ${req.method || "UNKNOWN"} not allowed. Use ${methods.join(" or ")}.`
    );
    return false;
  }
  return true;
}
