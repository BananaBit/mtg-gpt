import { enforceMethod } from "../../lib/http/method.js";
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { getCollectionStats } from "../../lib/collection/stats-service.js";
import { sendError, ErrorCodes } from "../../lib/http/errors.js";

export default async function handler(req, res) {
  if (!enforceMethod(req, res, "GET") || !authenticateAction(req, res)) return;
  try { return res.status(200).json(await getCollectionStats()); }
  catch (error) { return sendError(res, 500, ErrorCodes.INTERNAL_ERROR, error.message); }
}
