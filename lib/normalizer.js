/**
 * Response normalizer – always returns { success, data } or { success, error }
 */

function success(data) {
  return {
    success: true,
    data: data ?? null,
  };
}

function error(code, message, details = null) {
  const err = {
    success: false,
    error: {
      code: code || 'API_ERROR',
      message: message || 'Failed to load music data',
    },
  };
  if (details) err.error.details = details;
  return err;
}

module.exports = { success, error };
