import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { searchCards } from "../../lib/cards/card-service.js";
import { sendSuccess } from "../../lib/http/response.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "GET")) return;

  const caller = authenticateAction(req, res, "read");
  if (!caller) return;

  const { set, name } = req.query;
  const number = req.query.number || req.query.collector_number;
  const id = req.query.id || req.query.scryfall_id;

  try {
    const results = await searchCards({ set, name, number, id, color: req.query.color, type: req.query.type });
    return sendSuccess(res, {
      items: results.items || []
    });
  } catch (error) {
    console.error("API Card Search error:", error);
    return sendError(
      res,
      500,
      ErrorCodes.INTERNAL_ERROR,
      error.message || "Failed to search cards."
    );
  }
}
