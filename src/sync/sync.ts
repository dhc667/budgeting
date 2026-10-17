import type { Instance } from "../instance/connect-link";
import type { AppSupabase } from "../supabase/client";
import { applyPull, type Changes, type LocalCopy } from "./copy";
import { type CopyStore, openCopyStore } from "./store";

export type CopySync = {
  // Loads the saved copy and publishes it, without pulling.
  load: () => Promise<void>;
  // Resolves when the pull is done, whether or not it succeeded: a failed pull keeps the copy.
  pull: () => Promise<void>;
  // Releases the saved copy's connection. Anything still in flight is dropped, and the next call
  // starts over from what is saved.
  close: () => void;
};

export type CopySyncOptions = {
  name: string;
  schemaVersion: number;
  fetchChanges: (since: number) => Promise<Changes>;
  publish: (copy: LocalCopy | null) => void;
};

export function createCopySync(options: CopySyncOptions): CopySync {
  const { name, schemaVersion, fetchChanges, publish } = options;
  let generation = 0;
  let copy: LocalCopy | null = null;
  let opening: Promise<CopyStore> | null = null;
  let running: Promise<void> | null = null;
  let followUp: Promise<void> | null = null;

  function load() {
    return open().then(() => undefined);
  }

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
    generation += 1;
    const closing = opening;
    opening = null;
    copy = null;
    void closing?.then(
      (store) => store.close(),
      () => undefined,
    );
  }

  function startPull() {
    const started = pullOnce().finally(() => {
      if (running === started) running = null;
    });
    running = started;
    return started;
  }

  function open(): Promise<CopyStore> {
    const mine = generation;
    opening ??= openCopyStore(name)
      .then(async (store) => {
        const saved = await store.load(schemaVersion);
        if (mine === generation) {
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

  async function pullOnce() {
    const mine = generation;
    try {
      const store = await open();
      for (;;) {
        const changes = await fetchChanges(copy?.version ?? 0);
        if (mine !== generation) return;
        const applied = applyPull(copy, changes, schemaVersion);
        switch (applied.outcome) {
          case "repull":
            await store.clear();
            copy = null;
            publish(null);
            break;
          case "applied":
            await store.save(applied.copy, applied.delta);
            if (mine !== generation) return;
            copy = applied.copy;
            if (applied.changed) publish(applied.copy);
            return;
        }
      }
    } catch (error) {
      console.warn("Pulling the local copy failed; keeping it as it is.", error);
    }
  }

  return { load, pull, close };
}

export function changesFrom(supabase: AppSupabase) {
  return async (since: number): Promise<Changes> => {
    const { data, error } = await supabase.rpc("changes_since", { since });
    if (error) throw error;
    return data;
  };
}

// One copy per user per instance, so another user on the device never reads it.
export function copyName(instance: Instance, userId: string): string {
  return `budgeting.copy ${instance.supabaseUrl} ${userId}`;
}
