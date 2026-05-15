import type { AppSettings, ToolCallTrace } from '../shared-types'
import { AGENT_MAX_TOOL_ITERATIONS } from '../shared-types'
import { requestAiWithTools } from '../transport'
import type {
  AgentMessage,
  AssistantContentBlock,
  AssistantToolUseBlock,
  ToolContext,
  ToolResultBlock
} from './tools/types'
import { isToolUseBlock } from './tools/types'
import { dispatchTool, listToolDefinitions, type ToolRegistry } from './tools/registry'

export type AgentLoopParams = {
  settings: AppSettings
  systemPrompt: string
  userPrompt: string
  registry: ToolRegistry
  ctx: ToolContext
  maxTokens?: number
  /** 单次任务最多允许的工具循环轮数。超过即抛错。 */
  maxIterations?: number
  /** 每次工具调用前后回调，便于打日志/进度上报。 */
  onToolCall?: (trace: ToolCallTrace) => void
}

export type AgentLoopResult = {
  /** 模型最后一轮（不含 tool_use）的纯文本输出。 */
  finalText: string
  /** 全部工具调用轨迹。 */
  toolCalls: ToolCallTrace[]
  /** loop 实际跑了几轮（每轮 = 一次 LLM 调用）。 */
  iterations: number
}

export class AgentIterationLimitError extends Error {
  constructor(public readonly iterations: number) {
    super(`agent loop 达到工具调用上限 ${iterations}，可能存在死循环或工具失败循环`)
    this.name = 'AgentIterationLimitError'
  }
}

/**
 * 跑一次完整的 agent loop：
 *
 *   loop:
 *     resp = transport.requestAiWithTools(messages, tools)
 *     if resp.stopReason === 'end_turn' or no tool_use: return final text
 *     dispatch each tool_use → tool_result
 *     append assistant + tool_result messages, continue
 *
 * 工具失败不抛出（dispatchTool 把异常包成 isError=true 的 tool_result），
 * 让模型有机会自我修正。只在循环上限被撞到时抛 AgentIterationLimitError。
 */
export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const maxIterations = params.maxIterations ?? AGENT_MAX_TOOL_ITERATIONS
  const tools = listToolDefinitions(params.registry)
  const messages: AgentMessage[] = [{ role: 'user', content: params.userPrompt }]
  const toolCalls: ToolCallTrace[] = []

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const response = await requestAiWithTools(
      params.settings,
      {
        system: params.systemPrompt,
        messages,
        tools,
        maxTokens: params.maxTokens
      },
      params.ctx.signal
    )

    const toolUses = response.contentBlocks.filter(isToolUseBlock)
    const finishedNoTools = toolUses.length === 0

    if (response.stopReason === 'end_turn' || finishedNoTools) {
      const finalText = extractText(response.contentBlocks)
      if (!finalText && toolCalls.length === 0 && iteration === 1) {
        throw new Error('AI 返回内容为空，模型未生成任何文本或工具调用。请检查模型是否支持 tool_use，或尝试更换模型。')
      }
      return { finalText, toolCalls, iterations: iteration }
    }

    if (response.stopReason === 'max_tokens') {
      // 模型被 max_tokens 截断；如果它还在中间发了 tool_use，照常执行；
      // 如果只是文本被截断，扔回 final 让上层用 normalize 看能否解析。
      if (finishedNoTools) {
        return {
          finalText: extractText(response.contentBlocks),
          toolCalls,
          iterations: iteration
        }
      }
    }

    // 把 assistant 这一轮的全部 block（含 text + tool_use）原样追加进消息列表，
    // 否则 Anthropic API 会拒绝："tool_use block 必须紧接 tool_result"。
    messages.push({ role: 'assistant', content: response.contentBlocks })

    const toolResults: ToolResultBlock[] = []
    for (const toolUse of toolUses) {
      const startedAt = Date.now()
      const result = await dispatchTool(params.registry, toolUse, params.ctx)
      const trace: ToolCallTrace = {
        tool: toolUse.name,
        args: toolUse.input ?? {},
        durationMs: Date.now() - startedAt,
        status: result.isError ? 'error' : 'ok',
        ...(result.isError ? { error: result.content.slice(0, 240) } : {})
      }
      toolCalls.push(trace)
      params.onToolCall?.(trace)
      toolResults.push(result)
    }

    messages.push({ role: 'user', content: toolResults })
  }

  throw new AgentIterationLimitError(maxIterations)
}

function extractText(blocks: AssistantContentBlock[]): string {
  return blocks
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
}

// re-export so callers don't need to dig into ./tools/types
export type { AssistantToolUseBlock }
