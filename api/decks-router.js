import { enforceMethod } from "../lib/http/method.js";
import { authenticateAction } from "../lib/auth/authenticate-action.js";
import { analyzeDeck } from "../lib/decks/analyze-service.js";
import { compareDecks } from "../lib/decks/compare-service.js";
import { optimizeDeck } from "../lib/decks/optimize-service.js";
import { sendError, ErrorCodes } from "../lib/http/errors.js";

export function createDecksRouter({
  authenticate = authenticateAction,
  analyze = analyzeDeck,
  compare = compareDecks,
  optimize = optimizeDeck
} = {}) {
  const operations = {
    analyze: async (req, res) => {
      if (!enforceMethod(req, res, "POST") || !authenticate(req, res)) return;
      if (typeof req.body?.decklist !== "string") {
        return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, "A decklist string is required.");
      }
      try {
        return res.status(200).json(await analyze({
          decklist: req.body.decklist,
          format: req.body.format,
          includeCollection: req.body.include_collection === true
        }));
      } catch (error) {
        return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, error.message);
      }
    },

    compare: async (req, res) => {
      if (!enforceMethod(req, res, "POST") || !authenticate(req, res)) return;
      try {
        return res.status(200).json(await compare({
          deckA: req.body?.deck_a,
          deckB: req.body?.deck_b,
          includeCollection: req.body?.include_collection === true
        }));
      } catch (error) {
        return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, error.message);
      }
    },

    optimize: async (req, res) => {
      if (!enforceMethod(req, res, "POST") || !authenticate(req, res)) return;
      if (typeof req.body?.decklist !== "string") {
        return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, "A decklist string is required.");
      }
      try {
        return res.status(200).json(await optimize({
          decklist: req.body.decklist,
          format: req.body.format,
          constraints: req.body.constraints || {}
        }));
      } catch (error) {
        return sendError(res, 400, ErrorCodes.INVALID_DECKLIST, error.message);
      }
    }
  };

  return async function decksRouter(req, res) {
    const operationName = req.query?.operation;
    if (typeof operationName !== "string" || !Object.hasOwn(operations, operationName)) {
      return sendError(res, 404, ErrorCodes.ROUTE_NOT_FOUND, "API route not found.");
    }
    return operations[operationName](req, res);
  };
}

export default createDecksRouter();
