// Aspire injects the API address via WithReference(api); fall back to the API's launch profile
// so `npm start` also works when the API is run on its own.
const target =
  process.env.API_HTTPS ||
  process.env.API_HTTP ||
  process.env.services__api__https__0 ||
  process.env.services__api__http__0 ||
  'http://localhost:5180';

module.exports = {
  '/api': { target, secure: false, changeOrigin: true },
};
