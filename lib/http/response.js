// Success response helpers for MTG GPT middleware

export function sendSuccess(res, data = {}) {
  return res.status(200).json({
    success: true,
    ...data,
  });
}
