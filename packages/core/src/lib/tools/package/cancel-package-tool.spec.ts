import { describe, expect, it } from 'vitest';
import type { ToolOutcome } from '../tool-outcome.js';
import { CANCEL_PACKAGE_TOOL_NAME, cancelPackageTool } from './cancel-package-tool.js';

describe('cancelPackageTool', () => {
  it('nem-hibás outcome-ot jelent a Trace-nek, DB-hívás nélkül', async () => {
    const reported: { name: string; outcome: ToolOutcome }[] = [];
    const tool = cancelPackageTool((_id, name, _input, outcome) => {
      reported.push({ name, outcome });
    });

    const execute = tool.execute as unknown as (
      input: Record<string, never>,
      context: { toolCallId: string },
    ) => Promise<string>;
    const content = await execute({}, { toolCallId: 'call_1' });

    expect(content).toContain('megszakítva');
    expect(reported).toHaveLength(1);
    expect(reported[0]?.name).toBe(CANCEL_PACKAGE_TOOL_NAME);
    expect(reported[0]?.outcome.isError).toBe(false);
  });
});
