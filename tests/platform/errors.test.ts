import { describe, expect, it, vi } from "vitest";
import { crashActions, type CrashHooks } from "../../src/platform/errors";
import { fail, ok } from "../../src/sim/result";

function hooks(overrides: Partial<CrashHooks> = {}): CrashHooks {
  return {
    pause: () => {},
    newGame: async () => {},
    loadBackup: async () => ok(),
    ...overrides,
  };
}

describe("the crash screen", () => {
  it("offers the backup, reloading once it is restored", async () => {
    const loadBackup = vi.fn(async () => ok());
    const reload = vi.fn();
    const actions = crashActions(hooks({ loadBackup }), reload);
    expect(await actions.loadBackup()).toEqual(ok());
    expect(loadBackup).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("stays up and says why when there is no backup", async () => {
    const reload = vi.fn();
    const actions = crashActions(
      hooks({ loadBackup: async () => fail("no_backup") }),
      reload,
    );
    expect(await actions.loadBackup()).toEqual(fail("no_backup"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("starts a new game, reloading once it is saved", async () => {
    const order: string[] = [];
    const actions = crashActions(
      hooks({ newGame: async () => void order.push("saved") }),
      () => order.push("reloaded"),
    );
    await actions.newGame();
    expect(order).toEqual(["saved", "reloaded"]);
  });
});
