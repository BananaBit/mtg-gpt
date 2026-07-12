import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { optimizeDeck } from "../../lib/decks/optimize-service.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "POST") || !authenticateAction(req, res)) return;
  if (typeof req.body?.decklist !== "string") return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, "A decklist string is required.");
  try { return res.status(200).json(await optimizeDeck({ decklist: req.body.decklist, format: req.body.format, constraints: req.body.constraints || {} })); }
  catch (error) { return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, error.message); }
}
