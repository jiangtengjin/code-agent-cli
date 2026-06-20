/**
 * code-agent init 命令实现
 *
 * 简单的包装函数，调用配置向导模块。
 */

import { setupWizard } from "../config/wizard.js";

export async function initAction(): Promise<void> {
  await setupWizard();
}
