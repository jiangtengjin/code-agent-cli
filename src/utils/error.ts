/**
 * 错误判定工具
 */

/**
 * 判断是否为中断错误。
 *
 * 中断需要与普通失败区分开：普通失败可以转成工具结果继续对话，中断必须一路
 * 向上传播，否则执行循环会把它当成可恢复错误接着跑。
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError";
  }

  return false;
}
