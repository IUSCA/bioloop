const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

function getUsersSubscribedToEvent({ event_name, resource_id, resource_type }) {
  const sql = Prisma.sql`
    with relevant_subscriptions as (
      select ns.id, ns.user_id, ns.role_id, ns.is_system_wide
      from notification_subscription ns
      join event_type et on et.id = ns.event_type_id 
      where upper(et."name") = upper(${event_name})
      and ns.is_active = true
      and (ns.expires_at IS null or ns.expires_at > now())
      and ns.resource_type = ${resource_type}
      and ns.resource_id = ${resource_id}
    ),
    user_subscriptions AS (
        SELECT DISTINCT user_id AS id
        FROM relevant_subscriptions
        WHERE user_id IS NOT NULL
    ),
    role_based_users AS (
        SELECT DISTINCT ur.user_id AS id
        FROM relevant_subscriptions rs
        JOIN user_role ur ON ur.role_id = rs.role_id
        WHERE rs.role_id IS NOT NULL
    ),
    system_wide_users AS (
        -- If there is at least one system-wide subscription, include all active users
        SELECT u.id
        FROM "user" u
        WHERE EXISTS (
            SELECT 1 FROM relevant_subscriptions WHERE is_system_wide = TRUE
        )
    ),
    all_users as (
      select id from user_subscriptions
      union
      select id from role_based_users
      union
      select id from system_wide_users
    )
    select u.id, u.username, u.email, u."name"
    from "user" u
    join "all_users" alu on alu.id = u.id
    where u.is_deleted = false
  `;
  return prisma.$queryRaw(sql);
}

function deleteEventSubscriptions({ event_name, resource_id, resource_type }) {
  return prisma.notification_subscription.deleteMany({
    where: {
      event_type: {
        name: {
          equals: event_name,
          mode: 'insensitive',
        },
      },
      resource_id,
      resource_type,
      is_active: true,
      is_recurring: false,
    },
  });
}

function getDeliveryDetails(user, channel) {
  switch (channel) {
    case 'email':
      return {
        email: user.email,
        name: user.name,
      };
    case 'slack':
      return {
        slack_id: user.slack_id,
        slack_username: user.slack_username,
      };
    case 'sms':
      return {
        phone_number: user.phone_number,
      };
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
}

module.exports = {
  getUsersSubscribedToEvent,
  deleteEventSubscriptions,
  getDeliveryDetails,
};
