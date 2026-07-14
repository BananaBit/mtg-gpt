import { enforceMethod } from "../lib/http/method.js";
import { authenticateAction } from "../lib/auth/authenticate-action.js";
import { validateRequestBody } from "../lib/http/request-body.js";
import { searchCollection } from "../lib/collection/search-service.js";
import { getCollectionStats } from "../lib/collection/stats-service.js";
import { checkDeckAgainstCollection } from "../lib/collection/check-deck-service.js";
import { sendError, ErrorCodes } from "../lib/http/errors.js";

export function createCollectionRouter({
  authenticate = authenticateAction,
  search = searchCollection,
  getStats = getCollectionStats,
  checkDeck = checkDeckAgainstCollection
} = {}) {
  const operations = {
    search: async (req, res) => {
      if (!enforceMethod(req, res, "GET") || !authenticate(req, res)) return;
      const filters = {
        name: req.query.name || req.query.query,
        setCode: req.query.set,
        collectorNumber: req.query.collector_number,
        location: req.query.location,
        finish: req.query.finish,
        condition: req.query.condition,
        language: req.query.language,
        scryfallId: req.query.scryfall_id
      };
      try {
        return res.status(200).json(await search(filters));
      } catch (error) {
        return sendError(res, 500, ErrorCodes.INTERNAL_ERROR, error.message);
      }
    },

    stats: async (req, res) => {
      if (!enforceMethod(req, res, "GET") || !authenticate(req, res)) return;
      try {
        return res.status(200).json(await getStats());
      } catch (error) {
        return sendError(res, 500, ErrorCodes.INTERNAL_ERROR, error.message);
      }
    },

    "check-deck": async (req, res) => {
      if (!enforceMethod(req, res, "POST") || !authenticate(req, res) || !validateRequestBody(req, res)) return;
      if (typeof req.body?.decklist !== "string") {
        return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, "A decklist string is required.");
      }
      try {
        const result = await checkDeck({
          decklist: req.body.decklist,
          matchPrinting: req.body.match_printing === true,
          includeLocations: req.body.include_locations !== false
        });
        return res.status(200).json(result);
      } catch (error) {
        return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, error.message);
      }
    }
  };

  return async function collectionRouter(req, res) {
    const operationName = req.query?.operation;
    if (typeof operationName !== "string" || !Object.hasOwn(operations, operationName)) {
      return sendError(res, 404, ErrorCodes.ROUTE_NOT_FOUND, "API route not found.");
    }
    return operations[operationName](req, res);
  };
}

export default createCollectionRouter();
