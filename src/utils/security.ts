import micromatch from "micromatch";

const SENSITIVE_PATTERNS = [
  "**/.env*",
  "**/config*.json",
  "**/config*.yaml",
  "**/*.pem",
  "**/*.key",
  "**/*-secret*",
  "**/credentials*",
  "**/.ssh/**",
  "**/.aws/**",
];

const DANGEROUS_COMMANDS = [
  /^rm\s+-rf\s+\//,
  /^dd\s+/,
  /^mkfs/,
  /^:\(\)\{ :\|:&\};:/,
  /^>\s+\/dev\/sda/,
];

export function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => micromatch.isMatch(filePath, pattern));
}

export function requiresExtraConfirm(filePath: string): boolean {
  return isSensitivePath(filePath);
}

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command.trim()));
}
