// UserRegisteredTemplate.js
const MessageTemplate = require('./base');

class UserRegisteredTemplate extends MessageTemplate {
  getEmailMessage() {
    return `Hello ${this.user.name}, welcome! Your account has been created.`;
  }

  getSlackMessage() {
    return `🎉 Welcome, ${this.user.name}! Your account is now active.`;
  }

  getSmsMessage() {
    return `Welcome, ${this.user.name}! Your account is ready.`;
  }
}

module.exports = UserRegisteredTemplate;
