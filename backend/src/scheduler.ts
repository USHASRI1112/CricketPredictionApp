export function startScheduler(job: () => Promise<void>, onError: (error: unknown) => void) {
  let running: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (running || stopped) return;
    running = job().catch(onError).finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, 60000);
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
