// 统一错误处理中间件
module.exports = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'INTERNAL_ERROR',
    message: err.message || '服务器内部错误',
  });
};
