// {
//    "name": "DATASET_STAGED",
//    "data": {"resource_id": "123", "resource_type": "dataset"},
//    "timestamp": "2023-01-01T00:00:00Z"
// }
class Event {
  constructor(name, data, timestamp) {
    this.name = name;
    this.data = data;
    this.timestamp = timestamp;
  }

  static fromJSON(json) {
    if (!json) {
      return null;
    }
    const { name, data, timestamp } = json;
    if (!name) {
      return null;
    }
    return new Event(name, data || {}, timestamp || null);
  }

  toJSON() {
    return {
      name: this.name,
      data: this.data,
      timestamp: this.timestamp,
    };
  }
}

module.exports = Event;
