class ConflictError extends Error {
  name = 'ConflictError';

  statusCode = 409;

  constructor(message = 'Conflict detected: the resource was modified by another process') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    this.name = this.constructor.name;
  }
}

module.exports = ConflictError;
