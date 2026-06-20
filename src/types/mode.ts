/**
 * 对话模式类型
 *
 * 四种模式覆盖不同使用场景：
 *   normal — 标准问答，按需调工具
 *   auto   — AI 自主规划执行
 *   plan   — 先出计划再逐步执行
 *   edit   — 仅文件编辑，不执行命令
 */
export type ChatMode = "normal" | "auto" | "plan" | "edit";
