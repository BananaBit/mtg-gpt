import { enforceMethod } from "../lib/http/method.js";
import { authenticateAction } from "../lib/auth/authenticate-action.js";
import { searchCards, getCardDetails } from "../lib/cards/card-service.js";
import { sendSuccess } from "../lib/http/response.js";
import { sendError, ErrorCodes } from "../lib/http/errors.js";

export function createCardsRouter({
  authenticate = authenticateAction,
  search = searchCards,
  getDetails = getCardDetails
} = {}) {
  const operations = {
    search: async (req, res) => {
      if (!enforceMethod(req, res, "GET")) return;
      if (!authenticate(req, res, "read")) return;

      const { set, name } = req.query;
      const number = req.query.number || req.query.collector_number;
      const id = req.query.id || req.query.scryfall_id;

      try {
        const results = await search({
          set,
          name,
          number,
          id,
          color: req.query.color,
          type: req.query.type
        });
        return sendSuccess(res, { items: results.items || [] });
      } catch (error) {
        console.error("API Card Search error:", error);
        return sendError(res, 500, ErrorCodes.INTERNAL_ERROR, error.message || "Failed to search cards.");
      }
    },

    details: async (req, res) => {
      if (!enforceMethod(req, res, "GET")) return;
      if (!authenticate(req, res, "read")) return;

      const { name, set } = req.query;
      const id = req.query.id || req.query.scryfall_id;
      const number = req.query.number || req.query.collector_number;

      if (!id && !name && !(set && number)) {
        return sendError(
          res,
          400,
          ErrorCodes.CARD_RESOLUTION_AMBIGUOUS,
          "Please provide a Scryfall ID, an exact card name, or set plus collector number."
        );
      }

      try {
        const card = await getDetails({ id, name, set, number });
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
        return sendSuccess(res, { card });
      } catch (error) {
        if (error.message === "Card not found") {
          return sendError(res, 404, ErrorCodes.CARD_NOT_FOUND, "Card not found in database or Scryfall.");
        }
        console.error("API Card Details error:", error);
        return sendError(res, 500, ErrorCodes.INTERNAL_ERROR, error.message || "Failed to retrieve card details.");
      }
    }
  };

  return async function cardsRouter(req, res) {
    const operationName = req.query?.operation;
    if (typeof operationName !== "string" || !Object.hasOwn(operations, operationName)) {
      return sendError(res, 404, ErrorCodes.ROUTE_NOT_FOUND, "API route not found.");
    }
    return operations[operationName](req, res);
  };
}

export default createCardsRouter();
