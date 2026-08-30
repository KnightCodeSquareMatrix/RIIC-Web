type ProcessCleanupEvent = "SIGINT" | "SIGTERM" | "exit";

export type ProcessCleanupTarget = {
  once(event: ProcessCleanupEvent, listener: () => void): unknown;
  removeListener(event: ProcessCleanupEvent, listener: () => void): unknown;
};

export function registerProcessCleanup(
  target: ProcessCleanupTarget,
  stop: (reason: string) => void,
) {
  let stopped = false;
  const stopOnce = (reason: string) => {
    if (stopped) return;
    stopped = true;
    stop(reason);
  };

  const onSigint = () => stopOnce("收到 SIGINT，正在关闭 infra-cli serve。");
  const onSigterm = () => stopOnce("收到 SIGTERM，正在关闭 infra-cli serve。");
  const onExit = () => stopOnce("进程退出，正在关闭 infra-cli serve。");

  target.once("SIGINT", onSigint);
  target.once("SIGTERM", onSigterm);
  target.once("exit", onExit);

  return () => {
    target.removeListener("SIGINT", onSigint);
    target.removeListener("SIGTERM", onSigterm);
    target.removeListener("exit", onExit);
  };
}
