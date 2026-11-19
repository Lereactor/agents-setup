'use strict';

const { dueReminders, markDelivery } = require('./reminders-store');

async function sendReminder(reminder) {
  const response = await fetch(`${process.env.WORKER_URL.replace(/\/$/, '')}/admin/runner-tg`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RUNNER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: 'sendMessage',
      chatId: reminder.chat_id,
      businessConnectionId: reminder.business_connection_id,
      text: `⏰ Напоминание\n\n${reminder.text}`,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram proxy HTTP ${response.status}`);
}

async function main() {
  for (const reminder of await dueReminders()) {
    try {
      await sendReminder(reminder);
      await markDelivery(reminder.id, true);
      console.log(`${new Date().toISOString()} delivered ${reminder.id}`);
    } catch (error) {
      await markDelivery(reminder.id, false, error.message);
      console.error(`${new Date().toISOString()} failed ${reminder.id}: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
