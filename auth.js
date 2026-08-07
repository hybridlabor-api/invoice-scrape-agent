const { loginUber } = require('./services/uber/auth');

if (require.main === module) {
  loginUber();
}

module.exports = { loginUber };
