import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { compareDecks } from "../../lib/decks/compare-service.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "POST") || !authenticateAction(req, res)) return;
  try { return res.status(200).json(await compareDecks({ deckA: req.body?.deck_a, deckB: req.body?.deck_b, includeCollection: req.body?.include_collection === true })); }
  catch (error) { return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, error.message); }
}
