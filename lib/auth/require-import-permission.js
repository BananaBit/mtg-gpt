import { sendError, ErrorCodes } from "../http/errors.js";

/**
 * Asserts that the authenticated caller has import level permissions.
 * @param {{ level: "read"|"import" }|null} caller 
 * @param {import("next").NextApiResponse} res 
 * @returns {boolean} True if authorized, false if rejected.
 */
export function requireImportPermission(caller, res) {
  if (!caller || caller.level !== "import") {
    sendError(
      res,
      403,
      ErrorCodes.FORBIDDEN,
      "Forbidden. Insufficient permissions for collection modifications."
    );
    return false;
  }
  return true;
}
