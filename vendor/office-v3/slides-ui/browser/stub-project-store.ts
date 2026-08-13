// ACMS stub: @genoffice/project-store — 仅类型
export interface ProjectApi {
  list(): Promise<Array<{ id: string; name: string }>>
  open(id: string): Promise<void>
}

export class ProjectStore {
  constructor() {}
  list() { return Promise.resolve([]) }
  ensure() { return Promise.resolve(null) }
}
