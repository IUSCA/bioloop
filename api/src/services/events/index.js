const EventEmitter = require('node:events');
const { PrismaClient } = require('@prisma/client');
const EVENTS = require('./constants');
const { findDuplicates } = require('../../utils');

const prisma = new PrismaClient();

// given a nested object, return an array of all the leaf values
function getLeaves(obj, names = []) {
  Object.values(obj).forEach((value) => {
    if (typeof value === 'object') {
      getLeaves(value, names);
    } else {
      names.push(value);
    }
  });
  return names;
}

function getEventNames() {
  const eventNames = getLeaves(EVENTS);
  const { unique, duplicates } = findDuplicates(eventNames);

  if (duplicates.size > 0) {
    throw new Error(`Duplicate event names detected: ${Array.from(duplicates).join(', ')}.`);
  }

  return [...unique];
}

const EVENT_NAMES = getEventNames();

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.internalEmitter = new EventEmitter();
    this.events = new Set(EVENT_NAMES);
  }

  onAny(handler) {
    // listen to all events
    this.internalEmitter.on('event', handler);
  }

  emit(eventName, ...args) {
    if (!this.events.has(eventName)) {
      console.warn(`Unknown event: ${eventName}`);
      return false;
    }
    this.internalEmitter.emit('event', eventName, ...args);
    return super.emit(eventName, ...args);
  }
}

async function populateEventTypes(eventNames) {
  return prisma.$transaction(async (tx) => {
    const existingEvents = await tx.event_type.findMany({
      where: {
        name: {
          in: eventNames,
        },
      },
      select: {
        name: true,
      },
    });

    const existingEventNames = new Set(existingEvents.map((e) => e.name));
    const missingEventNames = eventNames.filter((name) => !existingEventNames.has(name));

    if (missingEventNames.length > 0) {
      await tx.event_type.createMany({
        data: missingEventNames.map((name) => ({ name })),
      });
    }
  });
}

const eventBus = new EventBus();

module.exports = {
  eventBus,
  EVENTS,
  EVENT_NAMES,
  populateEventTypes,
};
