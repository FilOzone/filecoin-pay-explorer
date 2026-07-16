/**
 * notification-scheduler — cron worker.
 * Daily: page subscribed wallets from D1 and enqueue one alert-check per wallet.
 * Placeholder handler for the scaffold; fan-out lands in the scheduler issue.
 */
export default {
  async scheduled(_event, _env, _ctx): Promise<void> {
    console.log(JSON.stringify({ event: "scheduler.tick", status: "placeholder" }));
  },
} satisfies ExportedHandler<Env>;
