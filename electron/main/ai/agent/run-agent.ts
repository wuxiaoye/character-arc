import { streamText, stepCountIs, tool, dynamicTool } from 'ai'
import { z } from 'zod'
import { createModel } from '../provider'
import type { AppSettings, AiAgentStreamHandlers, ToolCallTrace } from '../shared-types'
import type { Tool, ToolContext } from './tools/types'

const ANY_INPUT_SCHEMA = z.record(z.string(), z.unknown())

export type RunAgentParams = {
  settings: AppSettings
  systemPrompt: string
  userPrompt: string
  tools: Tool[]
  ctx: ToolContext
  handlers: AiAgentStreamHandlers
  maxTokens?: number
  maxSteps?: number
}

export type RunAgentResult = {
  finalText: string
  toolCalls: ToolCallTrace[]
  iterations: number
}

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const maxSteps = params.maxSteps ?? 8
  const toolCalls: ToolCallTrace[] = []
  const toolStartTimes = new Map<string, number>()
  let stepCount = 0

  const sdkTools: Record<string, ReturnType<typeof dynamicTool>> = {}
  for (const t of params.tools) {
    sdkTools[t.definition.name] = dynamicTool({
      description: t.definition.description,
      inputSchema: ANY_INPUT_SCHEMA,
      execute: async (input) => {
        const result = await t.handler(input as Record<string, unknown>, params.ctx)
        if (result.isError) {
          throw new Error(result.content)
        }
        return result.content
      }
    })
  }

  params.handlers.onAgentStatus('正在思考...', 1, maxSteps)

  const result = streamText({
    model: createModel(params.settings),
    system: params.systemPrompt,
    prompt: params.userPrompt,
    tools: sdkTools,
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens: params.maxTokens,
    abortSignal: params.ctx.signal,
    experimental_onToolCallStart: ({ toolCall }) => {
      const id = toolCall.toolCallId
      toolStartTimes.set(id, Date.now())
      params.handlers.onToolUseStart(id, toolCall.toolName, (toolCall.input as Record<string, unknown>) ?? {})
    },
    experimental_onToolCallFinish: (event) => {
      const id = event.toolCall.toolCallId
      const startedAt = toolStartTimes.get(id) ?? Date.now()
      const durationMs = event.durationMs ?? (Date.now() - startedAt)
      const errored = !event.success
      const content = errored
        ? String(event.error ?? '')
        : typeof event.output === 'string' ? event.output : JSON.stringify(event.output ?? '')
      params.handlers.onToolResult(id, event.toolCall.toolName, content.slice(0, 200), errored, durationMs)
      toolCalls.push({
        tool: event.toolCall.toolName,
        args: (event.toolCall.input as Record<string, unknown>) ?? {},
        durationMs,
        status: errored ? 'error' : 'ok',
        ...(errored ? { error: content.slice(0, 240) } : {})
      })
    },
    onStepFinish: () => {
      stepCount++
      if (stepCount < maxSteps) {
        params.handlers.onAgentStatus(`第 ${stepCount + 1} 轮推理...`, stepCount + 1, maxSteps)
      }
    }
  })

  let fullText = ''
  for await (const chunk of result.textStream) {
    fullText += chunk
    params.handlers.onTextDelta(chunk)
  }

  return { finalText: fullText, toolCalls, iterations: stepCount }
}
