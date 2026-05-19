import type { AiTaskPayload } from '../shared-types'
import { getAllSkills, refreshRegistry } from './registry'
import { pickSkillsFor } from './matcher'
import type { SkillSelection } from './types'

export type ResolvedTaskSkills = {
  projectId: string
  skills: SkillSelection[]
  usedSkillIds: string[]
}

export async function resolveTaskSkills(task: AiTaskPayload): Promise<ResolvedTaskSkills> {
  const projectId = String(task.context.projectId ?? '').trim()
  await refreshRegistry(projectId || undefined).catch(() => {})

  const skills = await pickSkillsFor(task, resolveEnabledSkillOverrides(task, projectId))
  return {
    projectId,
    skills,
    usedSkillIds: skills.map((skill) => skill.id)
  }
}

function resolveEnabledSkillOverrides(
  task: AiTaskPayload,
  projectId: string
): Map<string, boolean> | undefined {
  if (!Array.isArray(task.context.projectSkills)) {
    return undefined
  }

  const enabledIds = new Set(
    task.context.projectSkills
      .map((skill) => {
        if (!skill || typeof skill !== 'object') {
          return ''
        }
        return String((skill as { id?: string }).id ?? '').trim()
      })
      .filter(Boolean)
  )

  const allSkills = getAllSkills(projectId || undefined)
  if (!allSkills.length) {
    return undefined
  }

  return new Map(allSkills.map((skill) => [skill.id, enabledIds.has(skill.id)]))
}
