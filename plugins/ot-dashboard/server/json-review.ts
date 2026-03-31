export interface DashboardJsonReviewTarget {
  fileName: string
  kind: "object" | "array" | "json"
}

export interface DashboardImpactChange {
  path: string
  change: "added" | "removed" | "changed"
  before: string
  after: string
}

export interface DashboardImpactSummary {
  added: number
  removed: number
  changed: number
  total: number
  highlights: DashboardImpactChange[]
}

export interface DashboardDiffLine {
  type: "context" | "add" | "remove"
  leftLineNumber: number | null
  rightLineNumber: number | null
  text: string
}

export interface DashboardJsonReview {
  parsedValue: unknown
  candidateText: string
  impact: DashboardImpactSummary
  diffLines: DashboardDiffLine[]
}

function flattenJson(value: unknown, prefix = "$", output = new Map<string, string>()) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      output.set(prefix, "[]")
      return output
    }
    value.forEach((item, index) => {
      flattenJson(item, `${prefix}[${index}]`, output)
    })
    return output
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      output.set(prefix, "{}")
      return output
    }
    entries.forEach(([key, child]) => {
      flattenJson(child, `${prefix}.${key}`, output)
    })
    return output
  }

  output.set(prefix, JSON.stringify(value))
  return output
}

function summarizeImpact(currentValue: unknown, nextValue: unknown): DashboardImpactSummary {
  const before = flattenJson(currentValue)
  const after = flattenJson(nextValue)
  const highlights: DashboardImpactChange[] = []
  let added = 0
  let removed = 0
  let changed = 0

  const paths = new Set([...before.keys(), ...after.keys()])
  for (const key of paths) {
    if (!before.has(key)) {
      added += 1
      if (highlights.length < 12) {
        highlights.push({ path: key, change: "added", before: "", after: after.get(key) || "" })
      }
      continue
    }
    if (!after.has(key)) {
      removed += 1
      if (highlights.length < 12) {
        highlights.push({ path: key, change: "removed", before: before.get(key) || "", after: "" })
      }
      continue
    }
    if (before.get(key) !== after.get(key)) {
      changed += 1
      if (highlights.length < 12) {
        highlights.push({ path: key, change: "changed", before: before.get(key) || "", after: after.get(key) || "" })
      }
    }
  }

  return {
    added,
    removed,
    changed,
    total: added + removed + changed,
    highlights
  }
}

function createLcsMatrix(left: string[], right: string[]) {
  const matrix = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = left[i] === right[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1])
    }
  }
  return matrix
}

function createDiffLines(leftText: string, rightText: string) {
  const left = leftText.split(/\r?\n/)
  const right = rightText.split(/\r?\n/)
  const matrix = createLcsMatrix(left, right)
  const lines: DashboardDiffLine[] = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      lines.push({
        type: "context",
        leftLineNumber: leftIndex + 1,
        rightLineNumber: rightIndex + 1,
        text: left[leftIndex]
      })
      leftIndex += 1
      rightIndex += 1
    } else if (matrix[leftIndex + 1][rightIndex] >= matrix[leftIndex][rightIndex + 1]) {
      lines.push({
        type: "remove",
        leftLineNumber: leftIndex + 1,
        rightLineNumber: null,
        text: left[leftIndex]
      })
      leftIndex += 1
    } else {
      lines.push({
        type: "add",
        leftLineNumber: null,
        rightLineNumber: rightIndex + 1,
        text: right[rightIndex]
      })
      rightIndex += 1
    }
  }

  while (leftIndex < left.length) {
    lines.push({
      type: "remove",
      leftLineNumber: leftIndex + 1,
      rightLineNumber: null,
      text: left[leftIndex]
    })
    leftIndex += 1
  }

  while (rightIndex < right.length) {
    lines.push({
      type: "add",
      leftLineNumber: null,
      rightLineNumber: rightIndex + 1,
      text: right[rightIndex]
    })
    rightIndex += 1
  }

  return lines.slice(0, 240)
}

function normalizeCandidateText(parsedValue: unknown) {
  return JSON.stringify(parsedValue, null, 2)
}

export function prepareJsonReview(definition: DashboardJsonReviewTarget, currentText: string, candidateText: string): DashboardJsonReview {
  const parsedValue = JSON.parse(candidateText)
  if (definition.kind === "array" && !Array.isArray(parsedValue)) {
    throw new Error(`${definition.fileName} must contain a JSON array.`)
  }
  if (definition.kind === "object" && (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue))) {
    throw new Error(`${definition.fileName} must contain a JSON object.`)
  }

  const currentValue = JSON.parse(currentText)
  const normalizedCandidateText = normalizeCandidateText(parsedValue)
  return {
    parsedValue,
    candidateText: normalizedCandidateText,
    impact: summarizeImpact(currentValue, parsedValue),
    diffLines: createDiffLines(JSON.stringify(currentValue, null, 2), normalizedCandidateText)
  }
}
