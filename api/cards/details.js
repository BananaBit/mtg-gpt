import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { getCardDetails } from "../../lib/cards/card-service.js";
import { sendSuccess } from "../../lib/http/response.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "GET")) return;

  const caller = authenticateAction(req, res, "read");
  if (!caller) return;

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
    const card = await getCardDetails({ id, name, set, number });
    
    // Set caching headers as in the previous implementation
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    
    return sendSuccess(res, { card });
  } catch (error) {
    if (error.message === "Card not found") {
      return sendError(res, 404, ErrorCodes.CARD_NOT_FOUND, "Card not found in database or Scryfall.");
    }
    console.error("API Card Details error:", error);
    return sendError(
      res,
      500,
      ErrorCodes.INTERNAL_ERROR,
      error.message || "Failed to retrieve card details."
    );
  }
}
