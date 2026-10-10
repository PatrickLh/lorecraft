/** 统一业务错误：路由层转换为 { error: { code, message } }（plan P2 统一错误格式）。 */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 500,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
