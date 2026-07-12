import { sendError, ErrorCodes } from "../http/errors.js";

/**
 * Verifies that the request body contains explicit confirmation.
 * @param {import("next").NextApiRequest} req 
 * @param {import("next").NextApiResponse} res 
 * @returns {boolean} True if confirmed, false if rejected.
 */
export function verifyImportConfirmation(req, res) {
  const { confirmed } = req.body || {};
  if (confirmed !== true) {
    sendError(
      res,
      400,
      ErrorCodes.INVALID_COLLECTION_EXPORT,
      "Import operation requires explicit confirmation parameter set to true."
    );
    return false;
  }
  return true;
}
