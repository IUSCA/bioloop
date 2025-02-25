const MessageTemplate = require('./base');
const datasetService = require('../../dataset');

class DatasetStagedTemplate extends MessageTemplate {
  async build() {
    // Fetch the dataset details
    this.dataset = await datasetService.get_dataset(this.event.resource_id);
    if (!this.dataset) {
      throw new Error('Dataset not found');
    }
    return this;
  }

  getEmailMessage(user) {
    return {
      subject: `📊 New dataset staged: ${this.dataset.name}`,
      html: `<p>Hi ${user.name},</p>
        <p>A new dataset has been staged for review: <strong>${this.dataset.name}</strong>.</p>
        <p>Please log in to the platform to review and approve it.</p>
        <p>Best regards,</p>
        <p>The Team</p>`,
      // eslint-disable-next-line max-len
      text: `Hi ${user.name},\n\nA new dataset has been staged for review: ${this.dataset.name}.\nPlease log in to the platform to review and approve it.\n\nBest regards,\nThe Team`,
    };
  }

  // eslint-disable-next-line no-unused-vars
  getSlackMessage(user) {
    return `📊 A new dataset is ready for review: ${this.dataset.name}`;
  }

  // eslint-disable-next-line no-unused-vars
  getSmsMessage(user) {
    return `New dataset staged: ${this.dataset.name}`;
  }
}
module.exports = DatasetStagedTemplate;
