class MessageTemplate {
  constructor(event) {
    this.event = event;
  }

  /**
   * Returns a message based on the delivery method.
   */
  getMessage(user, deliveryMethod) {
    // get*Message methods must not have side effects
    try {
      switch (deliveryMethod) {
        case 'email':
          return this.getEmailMessage(user);
        case 'slack':
          return this.getSlackMessage(user);
        case 'sms':
          return this.getSmsMessage(user);
        default:
          return this.getGenericMessage(user);
      }
    } catch (error) {
      // Handle any errors that occur during message generation
      console.error('Error generating message:', error);
      return null; // or return a default message
    }
  }

  async build() {
    // Subclasses can override this method to perform additional setup or
    // asynchronous operations required to prepare the message. For instance,
    // you might need to fetch extra data or execute asynchronous tasks before
    // the message is finalized.

    // Handling errors in the build process:
    // propagate transient errors to the caller, so that the message can be retried
    // throw NonRetryableError for unrecoverable errors
    return this;
  }

  /**
   * Default message if a specific delivery method isn't implemented.
   */
  getGenericMessage(user) {
    return `Hello ${user.name}, you have a new notification about ${this.event.name}.`;
  }

  getEmailMessage(user) { return this.getGenericMessage(user); }

  getSlackMessage(user) { return this.getGenericMessage(user); }

  getSmsMessage(user) { return this.getGenericMessage(user); }
}

module.exports = MessageTemplate;
