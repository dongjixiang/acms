// 统一错误处理中间件
module.exports = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);
  const status = err.status || 500;
  const body = {
    error: err.code || 'INTERNAL_ERROR',
    message: err.message || '服务器内部错误',
  };
  // 传递附加的错误数据（如 REVIEW_FAILED 的 review 对象）
  if (err.review) body.review = err.review;
  if (err.errors) body.errors = err.errors;
  res.status(status).json(body);
};
