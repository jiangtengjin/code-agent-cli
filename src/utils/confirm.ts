/**
 * 用户确认交互工具
 *
 * 用于工具执行前的安全确认流程：
 *   普通操作：Y/n 单键确认
 *   危险操作：需要输入 "YES" 才能通过
 */

import * as readline from "node:readline";

/** 普通确认：Y/n 回车即确认 */
export async function userConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (Y/n): `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "" || trimmed === "y" || trimmed === "yes") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

/** 危险操作确认：必须输入完整的 "YES" */
export async function userConfirmDangerous(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`⚠ ${message} (输入 YES 确认): `, (answer) => {
      rl.close();
      resolve(answer.trim() === "YES");
    });
  });
}
