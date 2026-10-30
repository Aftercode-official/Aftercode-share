export async function broadcastNotification(client, notification) {
  const recipients = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    recipients.push(...data.users.map((user) => user.id));
    if (data.users.length < 1000) break;
  }

  for (let index = 0; index < recipients.length; index += 500) {
    const rows = recipients.slice(index, index + 500).map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: notification.actorId,
      actor_name: notification.actorName,
      actor_avatar: notification.actorAvatar || "",
      notification_type: notification.type,
      project_title: notification.title,
      message: notification.message || "",
      thumbnail_url: notification.thumbnailPath || null,
      event_id: notification.eventId || null
    }));
    if (!rows.length) continue;
    const { error } = await client.from("notifications").insert(rows);
    if (error) throw error;
  }
  return recipients.length;
}
