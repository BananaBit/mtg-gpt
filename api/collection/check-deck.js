import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { validateRequestBody } from "../../lib/http/request-body.js";
import { checkDeckAgainstCollection } from "../../lib/collection/check-deck-service.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "POST") || !authenticateAction(req, res) || !validateRequestBody(req, res)) return;
  if (typeof req.body?.decklist !== "string") return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, "A decklist string is required.");
  try {
    const result = await checkDeckAgainstCollection({
      decklist: req.body.decklist, matchPrinting: req.body.match_printing === true,
      includeLocations: req.body.include_locations !== false
    });
    return res.status(200).json(result);
  } catch (error) { return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, error.message); }
}
