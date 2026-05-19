// server/api/utils/response.js
// Consistent JSON response wrappers

export function successResponse(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function errorResponse(res, message = 'An error occurred', statusCode = 500, details = null) {
  const body = {
    success: false,
    error: message,
  };
  if (details && process.env.NODE_ENV !== 'production') {
    body.details = details;
  }
  return res.status(statusCode).json(body);
}

export function redirectWithError(res, frontendUrl, message) {
  const url = new URL('/payment/failure', frontendUrl);
  url.searchParams.set('reason', message);
  return res.redirect(302, url.toString());
}

export function redirectWithSuccess(res, frontendUrl, orderId) {
  const url = new URL('/payment-success.html', frontendUrl);
  url.searchParams.set('orderId', orderId);
  return res.redirect(302, url.toString());
}
