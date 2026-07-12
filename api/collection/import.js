import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { requireImportPermission } from "../../lib/auth/require-import-permission.js";
import { verifyImportConfirmation } from "../../lib/auth/verify-import-confirmation.js";
import { validateRequestBody } from "../../lib/http/request-body.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";
import { importCollection } from "../../lib/collection/imports/import-service.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "POST") || !validateRequestBody(req, res)) return;
  const caller = authenticateAction(req, res, "import");
  if (!caller || !requireImportPermission(caller, res) || !verifyImportConfirmation(req, res)) return;

  const { source, filename = null, csv, mode } = req.body || {};
  if (source !== "manabox") {
    return sendError(res, 400, ErrorCodes.UNSUPPORTED_IMPORT_SOURCE, "Only ManaBox imports are currently supported.");
  }
  if (mode !== "synchronize") {
    return sendError(res, 400, ErrorCodes.INVALID_COLLECTION_EXPORT, "Import mode must be 'synchronize'.");
  }
  if (typeof csv !== "string" || !csv.trim()) {
    return sendError(res, 400, ErrorCodes.INVALID_COLLECTION_EXPORT, "A non-empty raw CSV string is required.");
  }
  try {
    const result = await importCollection({ csvText: csv, source, filename, confirmed: true });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Collection import failed:", error);
    return sendError(res, 400, ErrorCodes.INVALID_COLLECTION_EXPORT, "The collection file could not be imported.", [
      { code: ErrorCodes.INVALID_COLLECTION_EXPORT, message: error.message }
    ]);
  }
}
