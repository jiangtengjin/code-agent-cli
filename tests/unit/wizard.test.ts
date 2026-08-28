import { describe, expect, it } from "vitest";
import {
  getDefaultBaseUrlForProvider,
  getFallbackModel,
  toModelOptions,
} from "../../src/config/wizard.js";

describe("getFallbackModel", () => {
  it("为已知厂商返回对应的兜底模型", () => {
    expect(getFallbackModel("deepseek")).toBe("deepseek-v4-flash");
    expect(getFallbackModel("qwen")).toBe("qwen-plus");
    expect(getFallbackModel("ollama")).toBe("qwen2.5-coder:7b");
  });

  it("GLM 的兜底模型不再是早已下线的 glm-4", () => {
    // 真实可用列表从 glm-4.5 起步，glm-4 已不存在
    expect(getFallbackModel("glm")).not.toBe("glm-4");
    expect(getFallbackModel("glm")).toBe("glm-4.6");
  });

  it("未知厂商也给出可用的兜底值", () => {
    expect(getFallbackModel("nonexistent")).toBe("deepseek-v4-flash");
  });
});

describe("toModelOptions", () => {
  it("把首个模型标注为最新", () => {
    const options = toModelOptions([
      { id: "glm-5.3", ownedBy: "z-ai" },
      { id: "glm-4.6", ownedBy: "z-ai" },
    ]);

    expect(options[0]).toEqual({
      value: "glm-5.3",
      label: "glm-5.3（最新）",
      hint: "提供方 z-ai",
    });
    expect(options[1].label).toBe("glm-4.6");
  });

  it("value 用原始 id，不带任何标注", () => {
    const options = toModelOptions([{ id: "glm-5.3" }]);

    // 标注只能出现在 label 里，value 会被写进配置文件
    expect(options[0].value).toBe("glm-5.3");
  });

  it("缺少 ownedBy 时 hint 为空而非 undefined", () => {
    const options = toModelOptions([{ id: "local-model" }]);

    expect(options[0].hint).toBe("");
  });

  it("空列表返回空数组", () => {
    expect(toModelOptions([])).toEqual([]);
  });
});

describe("getDefaultBaseUrlForProvider", () => {
  it("为 ollama 返回本地地址，使其也能查询模型列表", () => {
    // 此前 ollama 分支从不给 baseUrl 赋值，导致本地用户拿不到模型列表
    expect(getDefaultBaseUrlForProvider("ollama")).toBe("http://localhost:11434/v1");
  });

  it("未知厂商返回 undefined，由调用方回退到手动输入", () => {
    expect(getDefaultBaseUrlForProvider("unknown")).toBeUndefined();
  });
});
