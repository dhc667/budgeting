import { applyPull, type Changes, type LocalCopy } from "./copy";
import { type CopyStore, openCopyStore } from "./store";

export function createCopySync(options: CopySyncOptions): CopySync {
  const { name, schemaVersion, fetchChanges, publish } = options;
  let closed = false;
  let copy: LocalCopy | null = null;
  let opening: Promise<CopyStore> | null = null;
  let running: Promise<void> | null = null;
  let followUp: Promise<void> | null = null;

  return { pull, close };

  // One pull at a time. Asking while one runs asks for one more after it, however often.
  function pull(): Promise<void> {
    if (!running) return startPull();
    followUp ??= running.then(() => {
      followUp = null;
      return startPull();
    });
    return followUp;
  }

  function close() {
    closed = true;
    const closing = opening;
    opening = null;
    copy = null;
    void closing?.then(
      (store) => store.close(),
      () => undefined,
    );
  }

  function startPull() {
    if (closed) return Promise.resolve();
    const started = pullOnce().finally(() => {
      if (running === started) running = null;
    });
    running = started;
    return started;
  }

  async function pullOnce() {
    try {
      const store = await open();
      for (;;) {
        const changes = await fetchChanges(copy?.version ?? 0);
        if (closed) return;
        const applied = applyPull(copy, changes, schemaVersion);
        switch (applied.outcome) {
          case "repull":
            await store.clear();
            // The screens keep the copy they show until the new one replaces it: a write of the
            // user's own can start this, and unmounting them would lose what they are showing.
            copy = null;
            break;
          case "applied":
            await store.save(applied.copy, applied.delta);
            if (closed) return;
            copy = applied.copy;
            if (applied.changed) publish(applied.copy);
            return;
        }
      }
    } catch (error) {
      console.warn("Pulling the local copy failed; keeping it as it is.", error);
    }
  }

  function open(): Promise<CopyStore> {
    opening ??= openCopyStore(name)
      .then(async (store) => {
        const saved = await store.load(schemaVersion);
        if (!closed) {
          copy = saved;
          if (saved) publish(saved);
        }
        return store;
      })
      .catch((error: unknown) => {
        opening = null;
        throw error;
      });
    return opening;
  }
}

export type CopySync = {
  pull: () => Promise<void>;
  // Anything still in flight is dropped, and later calls do nothing.
  close: () => void;
};

export type CopySyncOptions = {
  name: string;
  schemaVersion: number;
  fetchChanges: (since: number) => Promise<Changes>;
  publish: (copy: LocalCopy | null) => void;
};
