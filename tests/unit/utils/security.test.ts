import { describe, expect, it } from "vitest";
import {
  isDangerousCommand,
  isSensitivePath,
  requiresExtraConfirm,
} from "../../../src/utils/security.js";

describe("安全工具函数", () => {
  describe("isSensitivePath", () => {
    it("应该识别敏感文件", () => {
      expect(isSensitivePath(".env")).toBe(true);
      expect(isSensitivePath("config.json")).toBe(true);
      expect(isSensitivePath("secret.pem")).toBe(true);
      expect(isSensitivePath("credentials.yaml")).toBe(true);
    });

    it("应该识别敏感目录", () => {
      expect(isSensitivePath(".ssh/id_rsa")).toBe(true);
      expect(isSensitivePath(".aws/credentials")).toBe(true);
    });

    it("应该忽略普通文件", () => {
      expect(isSensitivePath("src/app.ts")).toBe(false);
      expect(isSensitivePath("README.md")).toBe(false);
    });
  });

  describe("requiresExtraConfirm", () => {
    it("应该对敏感文件要求二次确认", () => {
      expect(requiresExtraConfirm(".env")).toBe(true);
      expect(requiresExtraConfirm("config.json")).toBe(true);
    });

    it("应该对普通文件不要求二次确认", () => {
      expect(requiresExtraConfirm("src/app.ts")).toBe(false);
    });
  });

  describe("isDangerousCommand", () => {
    it("应该识别危险命令", () => {
      expect(isDangerousCommand("rm -rf /")).toBe(true);
      expect(isDangerousCommand("dd if=/dev/zero of=/dev/sda")).toBe(true);
      expect(isDangerousCommand("mkfs.ext4 /dev/sda1")).toBe(true);
    });

    it("应该忽略安全命令", () => {
      expect(isDangerousCommand("ls -la")).toBe(false);
      expect(isDangerousCommand("git status")).toBe(false);
      expect(isDangerousCommand("npm install")).toBe(false);
    });
  });
});
