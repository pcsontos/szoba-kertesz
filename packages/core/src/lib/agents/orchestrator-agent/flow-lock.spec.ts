import { describe, expect, it } from 'vitest';
import { findLastFlowSignal } from './flow-lock.js';
import type { Message } from '../agent-loop.js';

const toolCallMessage = (toolName: string): Message => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolCallId: 'c1', toolName, input: {} }],
});
const textMessage = (text: string): Message => ({ role: 'assistant', content: text });
const userMessage = (text: string): Message => ({ role: 'user', content: text });

describe('findLastFlowSignal', () => {
  it('üres history esetén "none"-t ad', () => {
    expect(findLastFlowSignal([])).toBe('none');
  });

  it('ha nincs jelző-tool a history-ban, "none"-t ad', () => {
    const history = [userMessage('szia'), textMessage('szia')];
    expect(findLastFlowSignal(history)).toBe('none');
  });

  it('routeToPackageAgent után nyitott ("package-open")', () => {
    const history = [userMessage('csomagot kérek'), toolCallMessage('routeToPackageAgent')];
    expect(findLastFlowSignal(history)).toBe('package-open');
  });

  it('savePackage után zárt ("none"), még ha korábban route is volt', () => {
    const history = [
      userMessage('csomagot kérek'),
      toolCallMessage('routeToPackageAgent'),
      userMessage('igen, mentsd'),
      toolCallMessage('savePackage'),
    ];
    expect(findLastFlowSignal(history)).toBe('none');
  });

  it('cancelPackage után zárt ("none")', () => {
    const history = [
      toolCallMessage('routeToPackageAgent'),
      toolCallMessage('cancelPackage'),
    ];
    expect(findLastFlowSignal(history)).toBe('none');
  });

  it('nem jelző-tool hívások nem nyitnak/zárnak flow-t', () => {
    const history = [
      toolCallMessage('routeToPackageAgent'),
      toolCallMessage('askInfoAgent'),
      toolCallMessage('validatePackage'),
    ];
    expect(findLastFlowSignal(history)).toBe('package-open');
  });

  it('a LEGUTOLSÓ jelző-tool számít, nem az első', () => {
    const history = [
      toolCallMessage('routeToPackageAgent'),
      toolCallMessage('cancelPackage'),
      toolCallMessage('routeToPackageAgent'),
    ];
    expect(findLastFlowSignal(history)).toBe('package-open');
  });
});
