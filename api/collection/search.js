import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { searchCollection } from "../../lib/collection/search-service.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "GET") || !authenticateAction(req, res)) return;
  const filters = {
    name: req.query.name || req.query.query, setCode: req.query.set,
    collectorNumber: req.query.collector_number, location: req.query.location,
    finish: req.query.finish, condition: req.query.condition,
    language: req.query.language, scryfallId: req.query.scryfall_id
  };
  try { return res.status(200).json(await searchCollection(filters)); }
  catch (error) { return sendError(res, 500, ErrorCodes.INTERNAL_ERROR, error.message); }
}
